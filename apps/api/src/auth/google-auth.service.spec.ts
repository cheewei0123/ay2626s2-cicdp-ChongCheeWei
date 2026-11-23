import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthService } from './auth.service.js';
import { GoogleAuthService } from './google-auth.service.js';
import type { GoogleProfile, GoogleVerifier } from './google.js';

const profile: GoogleProfile = {
  sub: 'g-1',
  email: 'chee@gmail.com',
  emailVerified: true,
  name: 'Chee',
};
// A user as the login query returns it
const row = (more: object = {}) => ({
  id: 'u1',
  email: 'chee@gmail.com',
  displayName: 'Chee',
  emailVerifiedAt: new Date('2026-11-01T00:00:00Z'),
  paynowMobile: null,
  phoneVerifiedAt: null,
  mfaEnabledAt: null,
  hasPassword: true,
  sessionVersion: 3,
  deletedAt: null,
  ...more,
});

describe('GoogleAuthService (KAN-95)', () => {
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn() },
    mfaBackupCode: { deleteMany: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const auth = { startLogin: vi.fn() };
  const verifier: GoogleVerifier = {
    clientId: 'id.apps.googleusercontent.com',
    verify: vi.fn(),
  };
  const service = new GoogleAuthService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
    verifier,
  );
  const verify = vi.mocked(verifier.verify);

  beforeEach(() => {
    vi.clearAllMocks();
    verify.mockResolvedValue(profile);
    auth.startLogin.mockResolvedValue('logged in');
  });

  it('gives the client ID to the web app, or null when off', () => {
    expect(service.clientId).toBe('id.apps.googleusercontent.com');
    const off = new GoogleAuthService(
      prisma as unknown as PrismaService,
      auth as unknown as AuthService,
    );
    expect(off.clientId).toBeNull();
    return expect(off.login('token')).rejects.toThrow(NotFoundException);
  });

  it('an account already linked to this Google account logs in through the normal path', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(row());
    expect(await service.login('token')).toBe('logged in');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { googleId: 'g-1' } }),
    );
    // startLogin decides about two-step login; it never sees deletedAt
    const { deletedAt: _gone, ...user } = row();
    expect(auth.startLogin).toHaveBeenCalledWith(user);
  });

  it('a new email makes a verified account with no usable password', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(row({ hasPassword: false }));
    await service.login('token');

    const { data } = prisma.user.create.mock.calls[0][0];
    expect(data).toMatchObject({
      email: 'chee@gmail.com',
      googleId: 'g-1',
      displayName: 'Chee',
      hasPassword: false,
    });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(data.passwordHash).toMatch(/^scrypt\$/);
  });

  it('links an account whose owner already proved the email', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'u1',
      emailVerifiedAt: new Date(),
      deletedAt: null,
    });
    prisma.user.update.mockResolvedValue(row());
    await service.login('token');
    expect(prisma.user.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'u1' },
      data: { googleId: 'g-1' },
    });
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('an unproved account with this email is cleaned before linking (no pre-made password stays)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'u1',
      emailVerifiedAt: null,
      deletedAt: null,
    });
    prisma.user.update.mockResolvedValue(row({ hasPassword: false }));
    await service.login('token');

    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data).toMatchObject({
      googleId: 'g-1',
      hasPassword: false,
      sessionVersion: { increment: 1 },
      mfaSecret: null,
      mfaEnabledAt: null,
    });
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    for (const table of [
      prisma.session,
      prisma.mfaBackupCode,
      prisma.passwordResetToken,
    ])
      expect(table.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
  });

  it('refuses a bad token, an unchecked Google email, and deleted accounts', async () => {
    verify.mockRejectedValueOnce(new Error('expired'));
    await expect(service.login('token')).rejects.toThrow(
      'Google sign-in failed. Try again.',
    );
    verify.mockResolvedValueOnce({ ...profile, emailVerified: false });
    await expect(service.login('token')).rejects.toThrow(
      'Your Google account email is not verified',
    );

    prisma.user.findUnique.mockResolvedValueOnce(
      row({ deletedAt: new Date() }),
    );
    await expect(service.login('token')).rejects.toThrow(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'u1',
      emailVerifiedAt: new Date(),
      deletedAt: new Date(),
    });
    await expect(service.login('token')).rejects.toThrow(
      'This account has been deleted',
    );
    expect(auth.startLogin).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
