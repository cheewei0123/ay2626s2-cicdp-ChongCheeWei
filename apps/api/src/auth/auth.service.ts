import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './auth-user.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { UpdateMeDto } from './dto/update-me.dto.js';
import { hashPassword, verifyPassword } from './password.js';
import { VerificationService } from './verification.service.js';

// The only user fields ever sent to a client; passwordHash is never in this list
const SAFE_USER = {
  id: true,
  email: true,
  displayName: true,
  emailVerifiedAt: true,
  paynowMobile: true,
} as const;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof SAFE_USER }>;

// A valid-looking hash that matches no password: used when the email is unknown,
// so a wrong email takes as long as a wrong password and can't be told apart
const NO_USER_HASH = `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`;

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
      select: { ...SAFE_USER, passwordHash: true },
    });
    const ok = await verifyPassword(
      dto.password,
      found?.passwordHash ?? NO_USER_HASH,
    );
    // Same message for both cases, so nobody can find out which emails have accounts
    if (!found || !ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.withToken({
      id: found.id,
      email: found.email,
      displayName: found.displayName,
      emailVerifiedAt: found.emailVerifiedAt,
      paynowMobile: found.paynowMobile,
    });
  }

  findSafeUser(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: SAFE_USER });
  }

  // Only the fields that were sent change; null on paynowMobile removes it.
  // null back means the account no longer exists.
  async updateProfile(id: string, dto: UpdateMeDto) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { displayName: dto.displayName, paynowMobile: dto.paynowMobile },
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

  // The token proves who the user is for the next hour (expiry is set in AuthModule)
  private async withToken(user: SafeUser) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { user, accessToken: await this.jwt.signAsync(payload) };
  }
}
