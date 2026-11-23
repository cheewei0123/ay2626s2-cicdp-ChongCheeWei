import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'node:crypto';
import { requireEnv } from '../common/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MfaPayload } from './auth-user.js';
import { AuthService, SAFE_USER } from './auth.service.js';
import { verifyPassword } from './password.js';
import { open, seal } from './secret-box.js';
import { matchTotp, newSecret, otpauthUrl } from './totp.js';

const BACKUP_CODES = 10;
// No 0/o, 1/l/i: easy to read off paper and type back
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

// Salted with the user id, so two people's codes never hash the same
const hashOf = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest('hex');
// "ABCD-efgh", "abcd efgh" and "abcdefgh" are the same backup code
const tidy = (code: string) => code.toLowerCase().replace(/[\s-]/g, '');

function backupCode() {
  let code = '';
  for (let i = 0; i < 8; i++)
    code += BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Two-step login with an authenticator app (KAN-92): after the password, a 6-digit
// code from Google Authenticator / Microsoft Authenticator / 1Password, or one of
// ten one-time backup codes. Turning it on or off needs the password again.
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  // The encryption key comes from JWT_SECRET (see secret-box.ts)
  private get key() {
    return requireEnv('JWT_SECRET');
  }

  private async checkPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true, mfaEnabledAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    // 403, not 401: the login is fine, so the app must not log you out
    if (!(await verifyPassword(password, user.passwordHash)))
      throw new ForbiddenException('Your password is wrong');
    return user;
  }

  // Step 1: a new secret, shown as a QR code (and as text to type in). It is kept
  // but does nothing until a code from the app proves the app has it.
  async setup(userId: string, password: string) {
    const user = await this.checkPassword(userId, password);
    if (user.mfaEnabledAt)
      throw new ConflictException('Two-step login is already on');
    const secret = newSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: seal(secret, this.key), mfaLastStep: null },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  // Step 2: the first code turns it on and gives the backup codes, shown only now
  async enable(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabledAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.mfaEnabledAt)
      throw new ConflictException('Two-step login is already on');
    if (!user.mfaSecret)
      throw new BadRequestException('Start setting up two-step login first');
    const step = matchTotp(open(user.mfaSecret, this.key), code);
    if (step === null)
      throw new BadRequestException(
        'That code is not right. Check the time on your phone and try the newest code.',
      );

    const codes = Array.from({ length: BACKUP_CODES }, backupCode);
    await this.prisma.$transaction([
      this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
      this.prisma.mfaBackupCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: hashOf(userId, tidy(c)) })),
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: new Date(), mfaLastStep: step },
      }),
    ]);
    return { backupCodes: codes };
  }

  // Turning it off needs both the password and a code, so a stolen login alone
  // (an unlocked phone, a copied token) can't remove it
  async disable(userId: string, password: string, code: string) {
    const user = await this.checkPassword(userId, password);
    if (!user.mfaEnabledAt)
      throw new BadRequestException('Two-step login is not on');
    if (!(await this.useCode(userId, code)))
      throw new ForbiddenException('That code is not right');
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null },
        select: SAFE_USER,
      }),
      this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
    ]);
    return updated;
  }

  // Step 2 of logging in: the half-way token and a code → a real login
  async finishLogin(mfaToken: string, code: string) {
    let payload: MfaPayload;
    try {
      payload = await this.jwt.verifyAsync<MfaPayload>(mfaToken);
    } catch {
      throw new UnauthorizedException('This login took too long. Start again.');
    }
    if (payload.typ !== 'mfa')
      throw new UnauthorizedException('This login took too long. Start again.');
    if (!(await this.useCode(payload.sub, code)))
      throw new UnauthorizedException('That code is not right');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { ...SAFE_USER, sessionVersion: true, deletedAt: true },
    });
    if (!user || user.deletedAt)
      throw new UnauthorizedException('This login took too long. Start again.');
    const { sessionVersion, deletedAt: _gone, ...safe } = user;
    return this.auth.withToken(safe, sessionVersion);
  }

  // True when the code is right, and uses it up: a 6-digit app code can't be used
  // again in the same or an older 30-second step; a backup code works once.
  // Both are claimed with a conditional update, so two requests at the same time
  // can't both use one code.
  async useCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabledAt: true, mfaLastStep: true },
    });
    if (!user?.mfaEnabledAt || !user.mfaSecret) return false;

    if (/^\d{6}$/.test(code)) {
      const step = matchTotp(
        open(user.mfaSecret, this.key),
        code,
        Date.now(),
        user.mfaLastStep,
      );
      if (step === null) return false;
      const { count } = await this.prisma.user.updateMany({
        where: {
          id: userId,
          OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }],
        },
        data: { mfaLastStep: step },
      });
      return count === 1;
    }

    const { count } = await this.prisma.mfaBackupCode.updateMany({
      where: { userId, codeHash: hashOf(userId, tidy(code)), usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  // How many backup codes are left, for the Profile screen
  backupCodesLeft(userId: string) {
    return this.prisma.mfaBackupCode.count({ where: { userId, usedAt: null } });
  }
}
