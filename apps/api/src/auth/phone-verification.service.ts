import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { SMS_SERVICE, type SmsService } from '../sms/sms.interface.js';
import { SAFE_USER } from './auth.service.js';

const CODE_MS = 10 * 60 * 1000; // a code lasts 10 minutes
const RESEND_MS = 60 * 1000; // at most one SMS a minute per account
const MAX_TRIES = 5; // wrong codes before the code is used up

// Salted with the user id, so the same code for two people never hashes the same
const hashOf = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest();

// Checking the PayNow number with an SMS code (KAN-91), so money paid by QR can only
// go to a number its owner proved they hold. Until the code is right, the old number
// (if any) stays as it was.
@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger('Phone');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SERVICE) private readonly sms: SmsService,
  ) {}

  async sendCode(userId: string, phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paynowMobile: true, phoneVerifiedAt: true },
    });
    if (user?.paynowMobile === phone && user.phoneVerifiedAt)
      throw new ConflictException('This number is already checked');

    const pending = await this.prisma.phoneVerification.findUnique({
      where: { userId },
    });
    const wait = pending
      ? pending.createdAt.getTime() + RESEND_MS - Date.now()
      : 0;
    if (wait > 0)
      throw new HttpException(
        `Wait ${Math.ceil(wait / 1000)} seconds before asking for another code`,
        429,
      );

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + CODE_MS);
    const fields = {
      phone,
      codeHash: hashOf(userId, code).toString('hex'),
      attempts: 0,
      expiresAt,
      createdAt: new Date(),
    };
    // A new code replaces the old one, so only the newest SMS works
    await this.prisma.phoneVerification.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
    });

    try {
      await this.sms.send({
        to: phone,
        text: `${code} is your SplitLah code to check this PayNow number. It expires in 10 minutes. Never share it.`,
      });
    } catch (error) {
      // Nothing was sent, so let them try again straight away
      await this.prisma.phoneVerification.delete({ where: { userId } });
      this.logger.warn(`code not sent: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        'The code could not be sent. Check the number and try again.',
      );
    }
    return { phone, expiresAt };
  }

  async verify(userId: string, code: string) {
    const pending = await this.prisma.phoneVerification.findUnique({
      where: { userId },
    });
    if (
      !pending ||
      pending.expiresAt <= new Date() ||
      pending.attempts >= MAX_TRIES
    )
      throw new BadRequestException(
        'This code has expired. Ask for a new one.',
      );

    const right = timingSafeEqual(
      hashOf(userId, code),
      Buffer.from(pending.codeHash, 'hex'),
    );
    if (!right) {
      // Counted in the database, so parallel guesses can't get past 5
      const { attempts } = await this.prisma.phoneVerification.update({
        where: { userId },
        data: { attempts: { increment: 1 } },
      });
      const left = MAX_TRIES - attempts;
      throw new BadRequestException(
        left > 0
          ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : 'Wrong code. Ask for a new one.',
      );
    }

    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { paynowMobile: pending.phone, phoneVerifiedAt: new Date() },
        select: SAFE_USER,
      }),
      this.prisma.phoneVerification.delete({ where: { userId } }),
    ]);
    return user;
  }

  // Removes the PayNow number, and any code waiting for one
  async remove(userId: string) {
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { paynowMobile: null, phoneVerifiedAt: null },
        select: SAFE_USER,
      }),
      this.prisma.phoneVerification.deleteMany({ where: { userId } }),
    ]);
    return user;
  }
}
