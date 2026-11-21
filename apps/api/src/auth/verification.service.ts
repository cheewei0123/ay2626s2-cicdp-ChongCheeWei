import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { EMAIL_SERVICE, type EmailService } from '../email/email.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Only the hash is stored: someone who reads the database still can't verify an email
const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

// Email verification (KAN-77): a one-time link that proves the person owns the address
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  // A new random token for this user, valid for 24 hours, emailed as a link
  async sendLink(user: { id: string; email: string; displayName: string }) {
    const token = randomBytes(32).toString('base64url'); // 256 bits, safe in a URL
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });
    const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
    await this.email.send({
      to: user.email,
      subject: 'Verify your email for SplitLah',
      text: [
        `Hi ${user.displayName},`,
        '',
        'Tap this link to verify your email and start splitting bills:',
        `${appUrl}/verify?token=${token}`,
        '',
        "The link works once and expires in 24 hours. If you didn't sign up, ignore this email.",
      ].join('\n'),
    });
  }

  // The link was opened: mark the token used and the email verified, together
  async verify(token: string) {
    const found = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    // Unknown, used and expired all get the same answer
    if (!found || found.usedAt || found.expiresAt < new Date()) {
      throw new BadRequestException(
        'This link is invalid or has expired. Log in and ask for a new one.',
      );
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: found.id },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: found.userId },
        data: { emailVerifiedAt: now },
      }),
    ]);
  }

  // "Send it again", for a logged-in user whose email isn't verified yet
  async resend(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerifiedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerifiedAt) {
      throw new ConflictException('Your email is already verified');
    }
    await this.sendLink(user);
  }
}
