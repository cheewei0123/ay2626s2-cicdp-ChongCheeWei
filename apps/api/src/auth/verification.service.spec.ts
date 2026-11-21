import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FakeEmailService } from '../email/fake-email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { VerificationService } from './verification.service.js';

const prisma = {
  emailVerificationToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
};
const user = { id: 'u1', email: 'chee@example.com', displayName: 'Chee' };
const HOUR = 60 * 60 * 1000;
const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

describe('VerificationService', () => {
  let email: FakeEmailService;
  let service: VerificationService;

  beforeEach(() => {
    vi.resetAllMocks();
    email = new FakeEmailService();
    service = new VerificationService(
      prisma as unknown as PrismaService,
      email,
    );
  });

  // The token only exists in the email, so pull it out of the link
  const tokenInEmail = () =>
    /verify\?token=([\w-]+)/.exec(email.sent[0].text)![1];

  describe('sendLink', () => {
    it('stores only a hash of the token and emails the link', async () => {
      await service.sendLink(user);

      const token = tokenInEmail();
      const saved = prisma.emailVerificationToken.create.mock.calls[0][0].data;
      expect(saved.userId).toBe('u1');
      expect(saved.tokenHash).toBe(sha256(token));
      expect(email.sent[0]).toMatchObject({
        to: 'chee@example.com',
        subject: 'Verify your email for SplitLah',
      });
      expect(email.sent[0].text).toContain('Hi Chee,');
    });

    it('makes the link expire in 24 hours', async () => {
      await service.sendLink(user);
      const { expiresAt } =
        prisma.emailVerificationToken.create.mock.calls[0][0].data;
      const left = expiresAt.getTime() - Date.now();
      expect(left).toBeGreaterThan(23 * HOUR);
      expect(left).toBeLessThanOrEqual(24 * HOUR);
    });

    it('points the link at APP_URL', async () => {
      vi.stubEnv('APP_URL', 'https://splitlah.duckdns.org');
      await service.sendLink(user);
      vi.unstubAllEnvs();
      expect(email.sent[0].text).toContain(
        'https://splitlah.duckdns.org/verify?token=',
      );
    });
  });

  describe('verify', () => {
    const stored = (changes = {}) => ({
      id: 't1',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + HOUR),
      ...changes,
    });

    it('marks the token used and the email verified in one transaction', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(stored());
      await service.verify('the-token');

      expect(
        prisma.emailVerificationToken.findUnique.mock.calls[0][0].where,
      ).toEqual({
        tokenHash: sha256('the-token'),
      });
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(
        prisma.emailVerificationToken.update.mock.calls[0][0].where,
      ).toEqual({
        id: 't1',
      });
      expect(prisma.user.update.mock.calls[0][0].where).toEqual({ id: 'u1' });
    });

    it.each([
      ['an unknown token', null],
      ['a used token', stored({ usedAt: new Date() })],
      ['an expired token', stored({ expiresAt: new Date(Date.now() - 1) })],
    ])('answers 400 for %s', async (_case, found) => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(found);
      await expect(service.verify('the-token')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('resend', () => {
    it('sends a new link to an unverified user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        emailVerifiedAt: null,
      });
      await service.resend('u1');
      expect(email.sent).toHaveLength(1);
    });

    it('answers 409 when the email is already verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        emailVerifiedAt: new Date(),
      });
      await expect(service.resend('u1')).rejects.toThrow(ConflictException);
      expect(email.sent).toHaveLength(0);
    });

    it('answers 404 when the account is gone', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resend('u1')).rejects.toThrow(NotFoundException);
    });
  });
});
