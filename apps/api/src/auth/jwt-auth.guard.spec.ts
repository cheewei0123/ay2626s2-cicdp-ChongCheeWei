import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const jwt = new JwtService({ secret: 'test-secret' });
// A fake database: user u1's password has been changed twice (sessionVersion 2).
// Session s1 is live; s-out was logged out; s-old ran out; s-other is someone else's.
const HOUR = 60 * 60 * 1000;
const sessions: Record<string, object> = {
  s1: { userId: 'u1', revokedAt: null, expiresAt: new Date(Date.now() + HOUR) },
  's-out': {
    userId: 'u1',
    revokedAt: new Date(),
    expiresAt: new Date(Date.now() + HOUR),
  },
  's-old': {
    userId: 'u1',
    revokedAt: null,
    expiresAt: new Date(Date.now() - 1),
  },
  's-other': {
    userId: 'u2',
    revokedAt: null,
    expiresAt: new Date(Date.now() + HOUR),
  },
};
const prisma = {
  session: {
    findUnique: vi.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id in sessions
          ? { ...sessions[where.id], user: { sessionVersion: 2 } }
          : null,
      ),
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
      sid: 's1',
    });
    const { req, context } = contextWith(`Bearer ${token}`);

    expect(await guard.canActivate(context)).toBe(true);
    expect(req.user).toEqual({
      id: 'u1',
      email: 'chee@example.com',
      sessionId: 's1',
    });
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

  it('rejects any other kind of token, e.g. the half-way MFA token', async () => {
    const half = await jwt.signAsync({ sub: 'u1', typ: 'mfa' });
    await expect(
      guard.canActivate(contextWith(`Bearer ${half}`).context),
    ).rejects.toThrow('This token cannot be used to log in');
  });

  // KAN-90: changing the password raises sessionVersion, ending older tokens.
  // KAN-97: logging out or running out ends one session.
  it.each([
    [
      'a token from before the password changed',
      { sub: 'u1', email: 'x', ver: 1, sid: 's1' },
    ],
    ['a 1-hour token from before sessions', { sub: 'u1', email: 'x', ver: 2 }],
    ['a logged-out session', { sub: 'u1', email: 'x', ver: 2, sid: 's-out' }],
    ['a session that ran out', { sub: 'u1', email: 'x', ver: 2, sid: 's-old' }],
    [
      "another user's session",
      { sub: 'u1', email: 'x', ver: 2, sid: 's-other' },
    ],
    [
      'a session that no longer exists',
      { sub: 'u1', email: 'x', ver: 2, sid: 'gone' },
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
