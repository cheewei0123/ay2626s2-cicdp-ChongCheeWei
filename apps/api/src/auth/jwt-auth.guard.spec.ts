import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const jwt = new JwtService({ secret: 'test-secret' });
// A fake database with one user, u1, whose password has been changed twice
const prisma = {
  user: {
    findUnique: vi.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'u1' ? { sessionVersion: 2 } : null),
    ),
  },
};
const guard = new JwtAuthGuard(jwt, prisma as unknown as PrismaService);

// A fake request with only the Authorization header
function contextWith(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, context };
}

describe('JwtAuthGuard', () => {
  it('lets a valid token through and puts the user on the request', async () => {
    const token = await jwt.signAsync({
      sub: 'u1',
      email: 'chee@example.com',
      ver: 2,
    });
    const { req, context } = contextWith(`Bearer ${token}`);

    expect(await guard.canActivate(context)).toBe(true);
    expect(req.user).toEqual({ id: 'u1', email: 'chee@example.com' });
  });

  it.each([
    ['no header', undefined],
    ['a non-Bearer header', 'Basic abc'],
    ['an empty Bearer token', 'Bearer '],
    ['a made-up token', 'Bearer not.a.jwt'],
  ])('rejects %s with 401', async (_case, header) => {
    await expect(
      guard.canActivate(contextWith(header).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = await new JwtService({ secret: 'attacker' }).signAsync({
      sub: 'u1',
      email: 'x',
    });
    await expect(
      guard.canActivate(contextWith(`Bearer ${forged}`).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a guest token, even though it has a valid signature', async () => {
    const guest = await jwt.signAsync({
      sub: 'p1',
      billId: 'b1',
      typ: 'guest',
    });
    const { req, context } = contextWith(`Bearer ${guest}`);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'A guest token cannot be used to log in',
    );
    expect(req.user).toBeUndefined();
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync(
      { sub: 'u1', email: 'x' },
      { expiresIn: -1 },
    );
    await expect(
      guard.canActivate(contextWith(`Bearer ${expired}`).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  // KAN-90: changing the password raises sessionVersion, ending older tokens
  it.each([
    [
      'a token from before the password changed',
      { sub: 'u1', email: 'x', ver: 1 },
    ],
    ['an old token with no version', { sub: 'u1', email: 'x' }],
    [
      'a token for an account that no longer exists',
      { sub: 'gone', email: 'x', ver: 0 },
    ],
  ])('rejects %s', async (_case, payload) => {
    const token = await jwt.signAsync(payload);
    const { req, context } = contextWith(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Your session has ended. Log in again.',
    );
    expect(req.user).toBeUndefined();
  });
});
