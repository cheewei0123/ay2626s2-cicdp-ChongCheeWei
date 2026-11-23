import {
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import { FakeSmsService } from '../sms/fake-sms.service.js';
import type { SmsService } from '../sms/sms.interface.js';
import { PhoneVerificationService } from './phone-verification.service.js';

const hash = (code: string) =>
  createHash('sha256').update(`u1:${code}`).digest('hex');
const NOW = new Date('2026-11-23T02:00:00.000Z');
const pending = (more: object = {}) => ({
  userId: 'u1',
  phone: '+6598765432',
  codeHash: hash('123456'),
  attempts: 0,
  expiresAt: new Date(NOW.getTime() + 10 * 60_000),
  createdAt: new Date(NOW.getTime() - 2 * 60_000),
  ...more,
});

describe('PhoneVerificationService (KAN-91)', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    phoneVerification: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  let sms: FakeSmsService;
  const service = (sender: SmsService = sms) =>
    new PhoneVerificationService(prisma as unknown as PrismaService, sender);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    sms = new FakeSmsService();
    prisma.user.findUnique.mockResolvedValue({
      paynowMobile: '+6591234567',
      phoneVerifiedAt: NOW,
    });
    prisma.phoneVerification.findUnique.mockResolvedValue(null);
  });
  afterEach(() => vi.useRealTimers());

  describe('sendCode', () => {
    it('texts a 6-digit code and stores only its hash, for 10 minutes', async () => {
      const result = await service().sendCode('u1', '+6598765432');

      expect(result).toEqual({
        phone: '+6598765432',
        expiresAt: new Date('2026-11-23T02:10:00.000Z'),
      });
      const [{ to, text }] = sms.sent;
      const code = /^(\d{6}) is your SplitLah code/.exec(text)![1];
      expect(to).toBe('+6598765432');
      const saved = prisma.phoneVerification.upsert.mock.calls[0][0];
      expect(saved.where).toEqual({ userId: 'u1' });
      expect(saved.create).toMatchObject({
        userId: 'u1',
        phone: '+6598765432',
        codeHash: hash(code),
        attempts: 0,
      });
      expect(JSON.stringify(saved)).not.toContain(`"${code}"`);
      // A new code replaces the old one and resets the tries
      expect(saved.update).toMatchObject({ codeHash: hash(code), attempts: 0 });
    });

    it('refuses the number that is already checked (409)', async () => {
      await expect(service().sendCode('u1', '+6591234567')).rejects.toThrow(
        new ConflictException('This number is already checked'),
      );
      expect(sms.sent).toEqual([]);
    });

    it('lets the same number be checked when it was never verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        paynowMobile: '+6591234567',
        phoneVerifiedAt: null,
      });
      await service().sendCode('u1', '+6591234567');
      expect(sms.sent).toHaveLength(1);
    });

    it('sends at most one SMS a minute per account (429)', async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(
        pending({ createdAt: new Date(NOW.getTime() - 15_000) }),
      );
      const error = await service()
        .sendCode('u1', '+6598765432')
        .catch((e: HttpException) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).message).toBe(
        'Wait 45 seconds before asking for another code',
      );
      expect(sms.sent).toEqual([]);
    });

    it('forgets the code and says so when the SMS fails (503)', async () => {
      const broken = {
        provider: 'sns',
        send: vi.fn().mockRejectedValue(new Error('throttled')),
      };

      await expect(
        service(broken).sendCode('u1', '+6598765432'),
      ).rejects.toThrow(
        new ServiceUnavailableException(
          'The code could not be sent. Check the number and try again.',
        ),
      );
      expect(prisma.phoneVerification.delete).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });
  });

  describe('verify', () => {
    it('moves the number into the profile as checked, and uses the code up', async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(pending());
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        paynowMobile: '+6598765432',
      });

      expect(await service().verify('u1', '123456')).toEqual({
        id: 'u1',
        paynowMobile: '+6598765432',
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { paynowMobile: '+6598765432', phoneVerifiedAt: NOW },
        }),
      );
      expect(prisma.phoneVerification.delete).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('counts a wrong code and says how many tries are left', async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(pending());
      prisma.phoneVerification.update.mockResolvedValue({ attempts: 1 });

      await expect(service().verify('u1', '654321')).rejects.toThrow(
        new BadRequestException('Wrong code. 4 tries left.'),
      );
      expect(prisma.phoneVerification.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { attempts: { increment: 1 } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it.each([
      [4, 'Wrong code. 1 try left.'],
      [5, 'Wrong code. Ask for a new one.'],
    ])('after %i wrong codes: "%s"', async (attempts, message) => {
      prisma.phoneVerification.findUnique.mockResolvedValue(pending());
      prisma.phoneVerification.update.mockResolvedValue({ attempts });
      await expect(service().verify('u1', '000000')).rejects.toThrow(
        new BadRequestException(message),
      );
    });

    it.each([
      ['no code was sent', null],
      ['the code expired', pending({ expiresAt: NOW })],
      ['5 wrong codes used it up', pending({ attempts: 5 })],
    ])('refuses even the right code when %s', async (_why, row) => {
      prisma.phoneVerification.findUnique.mockResolvedValue(row);
      await expect(service().verify('u1', '123456')).rejects.toThrow(
        new BadRequestException('This code has expired. Ask for a new one.'),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  it('remove clears the number, its check and any waiting code', async () => {
    prisma.user.update.mockResolvedValue({ id: 'u1', paynowMobile: null });

    expect(await service().remove('u1')).toEqual({
      id: 'u1',
      paynowMobile: null,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paynowMobile: null, phoneVerifiedAt: null },
      }),
    );
    expect(prisma.phoneVerification.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });
  describe('alongside a Telegram check', () => {
    it('a waiting Telegram link is no reason to wait, and the SMS cancels it', async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(
        pending({ codeHash: null, createdAt: NOW }),
      );
      await service().sendCode('u1', '+6598765432');
      expect(
        prisma.phoneVerification.upsert.mock.calls[0][0].update,
      ).toMatchObject({ linkHash: null, telegramUserId: null });
    });

    it('a code is refused while only a Telegram link is waiting', async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(
        pending({ codeHash: null }),
      );
      await expect(service().verify('u1', '123456')).rejects.toThrow(
        'This code has expired. Ask for a new one.',
      );
    });
  });

  it('only offers SMS on the live site when texts really go out', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(service().smsReady).toBe(false);
    expect(service({ provider: 'sns', send: vi.fn() }).smsReady).toBe(true);
    vi.stubEnv('NODE_ENV', 'test');
    expect(service().smsReady).toBe(true);
    vi.unstubAllEnvs();
  });
});
