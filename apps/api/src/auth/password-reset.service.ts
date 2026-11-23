import {
  ForbiddenException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { EMAIL_SERVICE, type EmailService } from '../email/email.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword, verifyPassword } from './password.js';

const RESET_MS = 30 * 60 * 1000; // a reset link lasts 30 minutes

const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

// Forgot, reset and change password (KAN-90)
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  // Always answers the same way, quickly: whether the email has an account is never
  // revealed, not even by how long the request takes (the email is sent in the background)
  async requestReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true, deletedAt: true },
    });
    // A deleted account (KAN-93) can't come back through a reset link
    if (!user || user.deletedAt) return;

    const token = randomBytes(32).toString('base64url'); // 256 bits, safe in a URL
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_MS),
      },
    });
    const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
    this.email
      .send({
        to: user.email,
        subject: 'Reset your SplitLah password',
        text: [
          `Hi ${user.displayName},`,
          '',
          'Tap this link to choose a new password:',
          `${appUrl}/reset-password?token=${token}`,
          '',
          "The link works once and expires in 30 minutes. If you didn't ask for it, ignore this email: your password stays the same.",
        ].join('\n'),
      })
      .catch((err: Error) =>
        this.logger.warn(`reset email not sent: ${err.message}`),
      );
  }

  // The link was opened and a new password chosen
  async reset(token: string, password: string): Promise<void> {
    const found = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!found || found.usedAt || found.expiresAt < new Date()) {
      throw new BadRequestException(
        'This link is invalid or has expired. Ask for a new one.',
      );
    }
    const now = new Date();
    await this.prisma.$transaction([
      // This link and any other unused ones for the account stop working
      this.prisma.passwordResetToken.updateMany({
        where: { userId: found.userId, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: found.userId },
        data: {
          passwordHash: await hashPassword(password),
          hasPassword: true, // an account made with Google now has one too (KAN-95)
          sessionVersion: { increment: 1 }, // logs out every device
        },
      }),
      // Opening a link sent to the address proves the person owns it
      this.prisma.user.updateMany({
        where: { id: found.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      }),
    ]);
  }

  // Logged in: needs the current password. Other devices are logged out;
  // this one gets a new token so it stays logged in.
  async change(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!(await verifyPassword(current, user.passwordHash))) {
      // 403, not 401: the login is fine, so the app must not log you out
      throw new ForbiddenException('Your current password is wrong');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(next),
        sessionVersion: { increment: 1 },
      },
      select: { sessionVersion: true },
    });
    const safe = (await this.auth.findSafeUser(userId))!;
    return this.auth.withToken(safe, updated.sessionVersion);
  }
}
