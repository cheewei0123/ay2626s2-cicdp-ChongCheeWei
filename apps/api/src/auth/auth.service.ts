import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload, MfaPayload } from './auth-user.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { UpdateMeDto } from './dto/update-me.dto.js';
import { hashPassword, verifyPassword } from './password.js';
import { VerificationService } from './verification.service.js';

// The only user fields ever sent to a client; passwordHash is never in this list
export const SAFE_USER = {
  id: true,
  email: true,
  displayName: true,
  emailVerifiedAt: true,
  paynowMobile: true,
  phoneVerifiedAt: true, // null = the number was never checked by SMS (KAN-91)
  mfaEnabledAt: true, // null = two-step login is off (KAN-92)
  hasPassword: true, // false = made with Google, no password yet (KAN-95)
} as const;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof SAFE_USER }>;

// A valid-looking hash that matches no password: used when the email is unknown,
// so a wrong email takes as long as a wrong password and can't be told apart
const NO_USER_HASH = `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`;

// How long a login lasts before the user logs in again (KAN-97)
export const SESSION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly verification: VerificationService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
          paynowMobile: dto.paynowMobile,
        },
        select: SAFE_USER,
      });
      // The account works even if the email fails: "Send again" can retry later
      await this.verification.sendLink(user).catch((err: Error) => {
        this.logger.warn(`verification email not sent: ${err.message}`);
      });
      return this.withToken(user);
    } catch (error) {
      // P2002 = unique constraint failed: this email already has an account
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const found = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        ...SAFE_USER,
        passwordHash: true,
        sessionVersion: true,
        deletedAt: true,
      },
    });
    const ok = await verifyPassword(
      dto.password,
      found?.passwordHash ?? NO_USER_HASH,
    );
    // Same message for every case, so nobody can find out which emails have accounts.
    // A deleted account (KAN-93) can't log in, even with the right password.
    if (!found || !ok || found.deletedAt) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { passwordHash: _hash, deletedAt: _gone, ...user } = found;
    return this.startLogin(user);
  }

  // The first factor was right (a password, or Google: KAN-95). With two-step login
  // on (KAN-92) that is not a login yet: a half-way token, good for 5 minutes, lets
  // POST /auth/mfa finish it with a code. Otherwise, a real login.
  async startLogin({
    sessionVersion,
    ...user
  }: SafeUser & { sessionVersion: number }) {
    if (user.mfaEnabledAt) {
      const payload: MfaPayload = { sub: user.id, typ: 'mfa' };
      return {
        mfaRequired: true as const,
        mfaToken: await this.jwt.signAsync(payload, { expiresIn: '5m' }),
      };
    }
    return this.withToken(user, sessionVersion);
  }

  findSafeUser(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: SAFE_USER });
  }

  // Only the fields that were sent change. The PayNow number changes through
  // /me/phone instead, which checks it by SMS (KAN-91). null = the account is gone.
  async updateProfile(id: string, dto: UpdateMeDto) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { displayName: dto.displayName },
        select: SAFE_USER,
      });
    } catch (error) {
      // P2025 = no row to update
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }
      throw error;
    }
  }

  // A new login: a Session row and a token for it, both good for 14 days (KAN-97).
  // `ver` ties it to the current password: see sessionVersion (KAN-90).
  async withToken(user: SafeUser, sessionVersion = 0) {
    const now = new Date();
    // Old logins of this user that have run out are no use to anyone
    await this.prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lte: now } },
    });
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
      },
      select: { id: true },
    });
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      ver: sessionVersion,
      sid: session.id,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: `${SESSION_DAYS}d`,
    });
    return { user, accessToken };
  }

  // Ends one login on the server, so its token stops working at once (KAN-97)
  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
