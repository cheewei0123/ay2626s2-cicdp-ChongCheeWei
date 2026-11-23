import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';
import { VerificationService } from './verification.service.js';

const safeUser = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: null,
  paynowMobile: '+6591234567',
  phoneVerifiedAt: null,
};

const uniqueError = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('AuthService (with a mocked database)', () => {
  let service: AuthService;
  let jwt: JwtService;
  // A fake PrismaService with only the two methods AuthService uses
  const prisma = {
    user: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  const verification = { sendLink: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    verification.sendLink.mockResolvedValue(undefined);
    // Dependency injection: Nest builds the real AuthService but hands it the fake database
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: VerificationService, useValue: verification },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
  });

  describe('register', () => {
    it('saves a hashed password and returns the user with a token', async () => {
      prisma.user.create.mockResolvedValue(safeUser);

      const result = await service.register({
        email: 'chee@example.com',
        password: 'correct horse',
        displayName: 'Chee',
        paynowMobile: '+6591234567',
      });

      const saved = prisma.user.create.mock.calls[0][0].data;
      expect(saved.email).toBe('chee@example.com');
      expect(saved.passwordHash).toMatch(/^scrypt\$/);
      expect(saved).not.toHaveProperty('password');
      expect(result.user).toEqual(safeUser);
      expect(await jwt.verifyAsync(result.accessToken)).toMatchObject({
        sub: 'u1',
      });
    });

    it('emails a verify link to the new user', async () => {
      prisma.user.create.mockResolvedValue(safeUser);
      await service.register({
        email: 'chee@example.com',
        password: 'correct horse',
        displayName: 'Chee',
      });
      expect(verification.sendLink).toHaveBeenCalledWith(safeUser);
    });

    it('still creates the account when the email cannot be sent', async () => {
      prisma.user.create.mockResolvedValue(safeUser);
      verification.sendLink.mockRejectedValue(new Error('smtp down'));
      const result = await service.register({
        email: 'chee@example.com',
        password: 'correct horse',
        displayName: 'Chee',
      });
      expect(result.user).toEqual(safeUser);
    });

    it('answers 409 when the email is already registered', async () => {
      prisma.user.create.mockRejectedValue(uniqueError());
      await expect(
        service.register({
          email: 'chee@example.com',
          password: 'correct horse',
          displayName: 'Chee',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('passes any other database error on', async () => {
      prisma.user.create.mockRejectedValue(new Error('db down'));
      await expect(
        service.register({
          email: 'chee@example.com',
          password: 'correct horse',
          displayName: 'Chee',
        }),
      ).rejects.toThrow('db down');
    });
  });

  describe('login', () => {
    it('returns the user without the password hash, plus a token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...safeUser,
        passwordHash: await hashPassword('correct horse'),
      });

      const result = await service.login({
        email: 'chee@example.com',
        password: 'correct horse',
      });

      expect(result.user).toEqual(safeUser);
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(await jwt.verifyAsync(result.accessToken)).toMatchObject({
        sub: 'u1',
        email: 'chee@example.com',
      });
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...safeUser,
        passwordHash: await hashPassword('correct horse'),
      });
      await expect(
        service.login({ email: 'chee@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('gives an unknown email the same error as a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever1' }),
      ).rejects.toThrow('Invalid email or password');
    });
  });

  it('findSafeUser never asks the database for the password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(safeUser);
    expect(await service.findSafeUser('u1')).toEqual(safeUser);
    expect(prisma.user.findUnique.mock.calls[0][0].select).not.toHaveProperty(
      'passwordHash',
    );
  });

  describe('updateProfile', () => {
    it('changes only the fields that were sent and returns the safe user', async () => {
      prisma.user.update.mockResolvedValue(safeUser);
      expect(
        await service.updateProfile('u1', { displayName: 'Chee W' }),
      ).toEqual(safeUser);
      const call = prisma.user.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'u1' });
      // The PayNow number can't change here: only through the SMS check (KAN-91)
      expect(call.data).toEqual({ displayName: 'Chee W' });
      expect(call.select).not.toHaveProperty('passwordHash');
    });

    it('returns null when the account is gone', async () => {
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );
      expect(await service.updateProfile('u1', {})).toBeNull();
    });

    it('passes on any other database error', async () => {
      prisma.user.update.mockRejectedValue(new Error('database down'));
      await expect(service.updateProfile('u1', {})).rejects.toThrow(
        'database down',
      );
    });
  });
});
