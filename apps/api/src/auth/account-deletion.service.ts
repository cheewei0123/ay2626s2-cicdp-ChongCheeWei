import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MfaService } from './mfa.service.js';
import { verifyPassword } from './password.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// How long a deleted account is kept before it is wiped
export const HOLD_MONTHS = 6;

// The moment before which deleted accounts are wiped: 6 calendar months before `now`
export function purgeCutoff(now: Date) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - HOLD_MONTHS);
  return cutoff;
}

// Deleting an account (KAN-93). It happens in two parts:
// 1. Now: the account is marked deleted. It can't log in, every login on every device
//    ends, its share links stop working, and its email stays taken.
// 2. 6 months later: a daily job wipes the user and everything they own (bills,
//    expenses, codes). In other people's bills they stay as a name only.
@Injectable()
export class AccountDeletionService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('AccountDeletion');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mfa: MfaService,
  ) {}

  // Needs the password, and a code too when two-step login is on, so a stolen
  // login (an unlocked phone, a copied token) can't delete the account.
  // 403 (not 401) for a wrong one: the login itself is fine.
  async delete(userId: string, password: string, code?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, mfaEnabledAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!(await verifyPassword(password, user.passwordHash)))
      throw new ForbiddenException('Your password is wrong');
    if (user.mfaEnabledAt && !(code && (await this.mfa.useCode(userId, code))))
      throw new ForbiddenException(
        'Type a code from your app, or a backup code',
      );

    await this.prisma.$transaction([
      // A new sessionVersion makes every token of this user stop working at once
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), sessionVersion: { increment: 1 } },
      }),
      this.prisma.session.deleteMany({ where: { userId } }),
      // Nothing left that could bring the account back or keep checking a number
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.emailVerificationToken.deleteMany({ where: { userId } }),
      this.prisma.phoneVerification.deleteMany({ where: { userId } }),
    ]);
  }

  // Wipes accounts deleted more than 6 months ago. The schema cascades the delete
  // to everything the user owns. Friends' spending from those bills is theirs, so it
  // is first unlinked from the bill instead of being wiped with it.
  // Returns how many accounts were wiped.
  async purge(now = new Date()) {
    const gone = { deletedAt: { lte: purgeCutoff(now) } };
    const [, { count }] = await this.prisma.$transaction([
      this.prisma.expense.updateMany({
        where: { bill: { owner: gone } },
        data: { billId: null },
      }),
      this.prisma.user.deleteMany({ where: gone }),
    ]);
    if (count > 0) this.logger.log(`wiped ${count} deleted account(s)`);
    return count;
  }

  // Once at start-up (a deploy restarts the API), then every day
  onApplicationBootstrap() {
    const run = () =>
      void this.purge().catch((err: Error) =>
        this.logger.error(`purge failed: ${err.message}`),
      );
    run();
    this.timer = setInterval(run, DAY_MS);
    this.timer.unref(); // never keeps the process (or a test run) alive
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
