import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const jwt = new JwtService({ secret: 'test-secret' });
const guard = new JwtAuthGuard(jwt);

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
    const token = await jwt.signAsync({ sub: 'u1', email: 'chee@example.com' });
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
});
