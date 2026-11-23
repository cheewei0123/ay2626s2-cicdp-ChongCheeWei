import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthService } from './auth.service.js';
import { MfaService } from './mfa.service.js';
import { hashPassword } from './password.js';
import { open, seal } from './secret-box.js';
import { base32Decode, hotp, stepAt } from './totp.js';

const KEY = 'jwt-secret-for-mfa-tests-0123456789';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const codeNow = (offsetSteps = 0) =>
  hotp(base32Decode(SECRET), stepAt(Date.now()) + offsetSteps);
const hashOf = (code: string) =>
  createHash('sha256').update(`u1:${code}`).digest('hex');

describe('MfaService (KAN-92)', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    mfaBackupCode: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const jwt = new JwtService({ secret: KEY });
  const auth = { withToken: vi.fn() };
  const service = new MfaService(
    prisma as unknown as PrismaService,
    jwt,
    auth as unknown as AuthService,
  );
  let passwordHash: string;
  // What the database holds for u1 with two-step login on
  const on = (more: object = {}) => ({
    email: 'chee@example.com',
    passwordHash,
    mfaSecret: seal(SECRET, KEY),
    mfaEnabledAt: new Date(),
    mfaLastStep: null,
    ...more,
  });

  beforeAll(async () => {
    passwordHash = await hashPassword('correct horse');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('JWT_SECRET', KEY);
    // Mid-step, so a code never crosses into the next 30 seconds during a test
    vi.useFakeTimers({ now: 1_795_000_005_000, toFake: ['Date'] });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.mfaBackupCode.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe('setup', () => {
    it('needs the password, then stores a new secret encrypted and gives the QR link', async () => {
      prisma.user.findUnique.mockResolvedValue(on({ mfaEnabledAt: null }));
      const result = await service.setup('u1', 'correct horse');

      expect(result.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(result.otpauthUrl).toBe(
        `otpauth://totp/SplitLah%3Achee%40example.com?secret=${result.secret}&issuer=SplitLah&algorithm=SHA1&digits=6&period=30`,
      );
      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data.mfaSecret).not.toContain(result.secret);
      expect(open(data.mfaSecret, KEY)).toBe(result.secret);
      expect(data.mfaLastStep).toBeNull();
    });

    it('refuses a wrong password, a missing user, or when it is already on', async () => {
      prisma.user.findUnique.mockResolvedValue(on({ mfaEnabledAt: null }));
      await expect(service.setup('u1', 'wrong')).rejects.toThrow(
        new ForbiddenException('Your password is wrong'),
      );
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setup('u1', 'correct horse')).rejects.toThrow(
        NotFoundException,
      );
      prisma.user.findUnique.mockResolvedValue(on());
      await expect(service.setup('u1', 'correct horse')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('enable', () => {
    it('the first right code turns it on and gives 10 backup codes, stored as hashes', async () => {
      prisma.user.findUnique.mockResolvedValue(on({ mfaEnabledAt: null }));
      const { backupCodes } = await service.enable('u1', codeNow());

      expect(backupCodes).toHaveLength(10);
      expect(new Set(backupCodes).size).toBe(10);
      for (const code of backupCodes)
        expect(code).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
      const { data } = prisma.mfaBackupCode.createMany.mock.calls[0][0];
      expect(data).toEqual(
        backupCodes.map((c) => ({
          userId: 'u1',
          codeHash: hashOf(c.replace('-', '')),
        })),
      );
      expect(prisma.mfaBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          mfaEnabledAt: expect.any(Date),
          mfaLastStep: stepAt(Date.now()),
        },
      });
    });

    it('refuses a wrong code, no setup yet, already on, or a missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(on({ mfaEnabledAt: null }));
      await expect(service.enable('u1', '000000')).rejects.toThrow(
        /That code is not right/,
      );
      prisma.user.findUnique.mockResolvedValue(
        on({ mfaEnabledAt: null, mfaSecret: null }),
      );
      await expect(service.enable('u1', codeNow())).rejects.toThrow(
        new BadRequestException('Start setting up two-step login first'),
      );
      prisma.user.findUnique.mockResolvedValue(on());
      await expect(service.enable('u1', codeNow())).rejects.toThrow(
        ConflictException,
      );
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.enable('u1', codeNow())).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.mfaBackupCode.createMany).not.toHaveBeenCalled();
    });
  });

  describe('finishLogin', () => {
    const token = () => jwt.signAsync({ sub: 'u1', typ: 'mfa' });

    it('the half-way token and a right app code make a real login', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(on()) // useCode
        .mockResolvedValueOnce({ id: 'u1', email: 'x', sessionVersion: 4 });
      auth.withToken.mockResolvedValue('logged in');

      expect(await service.finishLogin(await token(), codeNow())).toBe(
        'logged in',
      );
      expect(auth.withToken).toHaveBeenCalledWith({ id: 'u1', email: 'x' }, 4);
      // The step is claimed only if it is newer than the last one used
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'u1',
          OR: [
            { mfaLastStep: null },
            { mfaLastStep: { lt: stepAt(Date.now()) } },
          ],
        },
        data: { mfaLastStep: stepAt(Date.now()) },
      });
    });

    it('a code already used (or used at the same moment elsewhere) is refused', async () => {
      // Seen before: the step is not newer than the last one used
      prisma.user.findUnique.mockResolvedValue(
        on({ mfaLastStep: stepAt(Date.now()) }),
      );
      await expect(
        service.finishLogin(await token(), codeNow()),
      ).rejects.toThrow('That code is not right');
      // A parallel request claimed the step first
      prisma.user.findUnique.mockResolvedValue(on());
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.finishLogin(await token(), codeNow()),
      ).rejects.toThrow('That code is not right');
      expect(auth.withToken).not.toHaveBeenCalled();
    });

    it('a backup code works once, however it is typed', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(on())
        .mockResolvedValueOnce({ id: 'u1', sessionVersion: 0 });
      await service.finishLogin(await token(), 'ABCD EFGH');
      expect(prisma.mfaBackupCode.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', codeHash: hashOf('abcdefgh'), usedAt: null },
        data: { usedAt: expect.any(Date) },
      });

      prisma.user.findUnique.mockResolvedValue(on());
      prisma.mfaBackupCode.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.finishLogin(await token(), 'abcd-efgh'),
      ).rejects.toThrow('That code is not right');
    });

    it('refuses a bad, expired or wrong-kind token, a wrong code, or a gone user', async () => {
      const startAgain = 'This login took too long. Start again.';
      await expect(service.finishLogin('nope', codeNow())).rejects.toThrow(
        startAgain,
      );
      const expired = await jwt.signAsync(
        { sub: 'u1', typ: 'mfa' },
        { expiresIn: -1 },
      );
      await expect(service.finishLogin(expired, codeNow())).rejects.toThrow(
        startAgain,
      );
      const login = await jwt.signAsync({ sub: 'u1', ver: 0, sid: 's1' });
      await expect(service.finishLogin(login, codeNow())).rejects.toThrow(
        startAgain,
      );

      prisma.user.findUnique.mockResolvedValue(on());
      await expect(
        service.finishLogin(await token(), '000000'),
      ).rejects.toThrow('That code is not right');
      // Two-step login was turned off meanwhile: no code can be right
      prisma.user.findUnique.mockResolvedValue(on({ mfaEnabledAt: null }));
      await expect(
        service.finishLogin(await token(), codeNow()),
      ).rejects.toThrow('That code is not right');
      prisma.user.findUnique
        .mockResolvedValueOnce(on())
        .mockResolvedValueOnce(null);
      await expect(
        service.finishLogin(await token(), codeNow()),
      ).rejects.toThrow(startAgain);
      expect(auth.withToken).not.toHaveBeenCalled();
    });
  });

  describe('disable', () => {
    it('needs the password and a code, then removes the secret and backup codes', async () => {
      prisma.user.findUnique.mockResolvedValue(on());
      prisma.user.update.mockResolvedValue({ id: 'u1', mfaEnabledAt: null });

      expect(await service.disable('u1', 'correct horse', codeNow())).toEqual({
        id: 'u1',
        mfaEnabledAt: null,
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null },
        }),
      );
      expect(prisma.mfaBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('refuses a wrong password, a wrong code, or when it is off', async () => {
      prisma.user.findUnique.mockResolvedValue(on());
      await expect(service.disable('u1', 'wrong', codeNow())).rejects.toThrow(
        'Your password is wrong',
      );
      await expect(
        service.disable('u1', 'correct horse', '000000'),
      ).rejects.toThrow('That code is not right');
      prisma.user.findUnique.mockResolvedValue(on({ mfaEnabledAt: null }));
      await expect(
        service.disable('u1', 'correct horse', codeNow()),
      ).rejects.toThrow('Two-step login is not on');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  it('counts the backup codes left', async () => {
    prisma.mfaBackupCode.count.mockResolvedValue(9);
    expect(await service.backupCodesLeft('u1')).toBe(9);
    expect(prisma.mfaBackupCode.count).toHaveBeenCalledWith({
      where: { userId: 'u1', usedAt: null },
    });
  });
});
