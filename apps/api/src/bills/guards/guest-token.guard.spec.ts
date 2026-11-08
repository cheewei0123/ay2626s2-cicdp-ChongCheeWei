import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { GuestTokenGuard } from './guest-token.guard.js';

const jwt = new JwtService({ secret: 'test-secret' });
const guard = new GuestTokenGuard(jwt);

// A mocked ExecutionContext: ShareTokenGuard has already put bill b1 on the request
function contextWith(token?: string) {
  const req = {
    headers: token ? { 'x-guest-token': token } : {},
    bill: { id: 'b1', ownerId: 'u1', status: 'OPEN' },
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, context };
}

const guestToken = (billId: string) =>
  jwt.signAsync({ sub: 'p1', billId, typ: 'guest' });

describe('GuestTokenGuard', () => {
  it('lets a guest of this bill through and puts them on the request', async () => {
    const { req, context } = contextWith(await guestToken('b1'));
    expect(await guard.canActivate(context)).toBe(true);
    expect(req.guest).toEqual({ participantId: 'p1', billId: 'b1' });
  });

  it('answers 401 without a guest token', async () => {
    await expect(guard.canActivate(contextWith().context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('answers 401 for a token that is not valid', async () => {
    await expect(
      guard.canActivate(contextWith('not.a.token').context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('answers 401 for a login token (only guest tokens are accepted here)', async () => {
    const login = await jwt.signAsync({ sub: 'u1', email: 'chee@example.com' });
    await expect(guard.canActivate(contextWith(login).context)).rejects.toThrow(
      'Join the bill first to get a guest token',
    );
  });

  it('answers 403 for a guest token from a different bill', async () => {
    const { req, context } = contextWith(await guestToken('other-bill'));
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(req.guest).toBeUndefined();
  });
});
