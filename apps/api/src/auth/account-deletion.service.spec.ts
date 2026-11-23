import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  AccountDeletionService,
  purgeCutoff,
} from './account-deletion.service.js';
import type { MfaService } from './mfa.service.js';
import { hashPassword } from './password.js';

describe('AccountDeletionService (KAN-93)', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn() },
    emailVerificationToken: { deleteMany: vi.fn() },
    phoneVerification: { deleteMany: vi.fn() },
    expense: { updateMany: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const mfa = { useCode: vi.fn() };
  const service = new AccountDeletionService(
    prisma as unknown as PrismaService,
    mfa as unknown as MfaService,
  );
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword('correct horse');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe('delete', () => {
    it('with the right password: marks it deleted, ends every login, removes what could bring it back', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash,
        mfaEnabledAt: null,
      });
      await service.delete('u1', 'correct horse');

      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.sessionVersion).toEqual({ increment: 1 });
      for (const table of [
        prisma.session,
        prisma.passwordResetToken,
        prisma.emailVerificationToken,
        prisma.phoneVerification,
      ])
        expect(table.deleteMany).toHaveBeenCalledWith({
          where: { userId: 'u1' },
        });
      expect(mfa.useCode).not.toHaveBeenCalled();
    });

    it('refuses a wrong password with 403, and a gone user with 404', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash,
        mfaEnabledAt: null,
      });
      await expect(service.delete('u1', 'wrong')).rejects.toThrow(
        ForbiddenException,
      );
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.delete('u1', 'correct horse')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('with two-step login on, also needs a right code', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash,
        mfaEnabledAt: new Date(),
      });
      const ask = 'Type a code from your app, or a backup code';
      await expect(service.delete('u1', 'correct horse')).rejects.toThrow(ask);
      mfa.useCode.mockResolvedValue(false);
      await expect(
        service.delete('u1', 'correct horse', '000000'),
      ).rejects.toThrow(ask);
      expect(prisma.user.update).not.toHaveBeenCalled();

      mfa.useCode.mockResolvedValue(true);
      await service.delete('u1', 'correct horse', '123456');
      expect(mfa.useCode).toHaveBeenLastCalledWith('u1', '123456');
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('purge', () => {
    it('the cutoff is 6 calendar months back', () => {
      expect(purgeCutoff(new Date('2026-11-23T08:00:00Z'))).toEqual(
        new Date('2026-05-23T08:00:00Z'),
      );
    });

    it('unlinks what friends spent from the bills, then wipes the old deleted accounts', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      prisma.user.deleteMany.mockResolvedValue({ count: 2 });
      const now = new Date('2026-11-23T08:00:00Z');

      expect(await service.purge(now)).toBe(2);
      const gone = { deletedAt: { lte: new Date('2026-05-23T08:00:00Z') } };
      expect(prisma.expense.updateMany).toHaveBeenCalledWith({
        where: { bill: { owner: gone } },
        data: { billId: null },
      });
      expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: gone });
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        'wiped 2 deleted account(s)',
      );
    });
  });

  it('runs the purge at start-up and then every day, and stops on shutdown', async () => {
    vi.useFakeTimers();
    const purge = vi.spyOn(service, 'purge').mockResolvedValue(0);
    service.onApplicationBootstrap();
    expect(purge).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(purge).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(purge).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    purge.mockRestore();
  });

  it('a failed purge is logged, not thrown', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const purge = vi
      .spyOn(service, 'purge')
      .mockRejectedValue(new Error('database down'));
    service.onApplicationBootstrap();
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith('purge failed: database down'),
    );
    service.onModuleDestroy();
    purge.mockRestore();
  });
});
