import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { EmailService } from '../email/email.interface.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';
import { PasswordResetService } from './password-reset.service.js';

const prisma = {
  user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  passwordResetToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
};
const email = { provider: 'fake', send: vi.fn() };
const auth = { findSafeUser: vi.fn(), withToken: vi.fn() };
const service = new PasswordResetService(
  prisma as unknown as PrismaService,
  auth as unknown as AuthService,
  email as unknown as EmailService,
);
const pat = { id: 'u1', email: 'pat@example.com', displayName: 'Pat' };

describe('PasswordResetService', () => {
  beforeEach(() => vi.resetAllMocks());

  describe('requestReset', () => {
    it('does nothing for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.requestReset('nobody@example.com');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('stores only a hash and emails a 30-minute link', async () => {
      prisma.user.findUnique.mockResolvedValue(pat);
      email.send.mockResolvedValue(undefined);
      await service.requestReset(pat.email);

      const { data } = prisma.passwordResetToken.create.mock.calls[0][0];
      const text: string = email.send.mock.calls[0][0].text;
      const token = /token=([\w-]+)/.exec(text)![1];
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.tokenHash).not.toBe(token);
      const minutes = (data.expiresAt.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(29);
      expect(minutes).toBeLessThanOrEqual(30);
      expect(text).toContain('expires in 30 minutes');
    });

    it('does not fail the request when the email cannot be sent', async () => {
      prisma.user.findUnique.mockResolvedValue(pat);
      email.send.mockRejectedValue(new Error('SMTP down'));
      await expect(service.requestReset(pat.email)).resolves.toBeUndefined();
    });
  });

  describe('reset', () => {
    const future = new Date(Date.now() + 60_000);

    it.each([
      ['unknown', null],
      ['used', { userId: 'u1', usedAt: new Date(), expiresAt: future }],
      ['expired', { userId: 'u1', usedAt: null, expiresAt: new Date(0) }],
    ])('refuses an %s link', async (_case, row) => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);
      await expect(service.reset('t', 'new password')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sets the password, ends old sessions and uses up the links together', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        userId: 'u1',
        usedAt: null,
        expiresAt: future,
      });
      await service.reset('t', 'new password');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const update = prisma.user.update.mock.calls[0][0];
      expect(update.data.sessionVersion).toEqual({ increment: 1 });
      expect(update.data.passwordHash).toMatch(/^scrypt\$/);
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', usedAt: null } }),
      );
    });
  });

  describe('change', () => {
    it('answers 404 when the account is gone', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.change('u1', 'a', 'b')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('needs the right current password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: await hashPassword('right one'),
      });
      await expect(
        service.change('u1', 'wrong one', 'new password'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns a token for the new session version', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: await hashPassword('right one'),
      });
      prisma.user.update.mockResolvedValue({ sessionVersion: 3 });
      auth.findSafeUser.mockResolvedValue(pat);
      auth.withToken.mockResolvedValue({ user: pat, accessToken: 'new' });

      expect(await service.change('u1', 'right one', 'new password')).toEqual({
        user: pat,
        accessToken: 'new',
      });
      expect(auth.withToken).toHaveBeenCalledWith(pat, 3);
    });
  });
});
