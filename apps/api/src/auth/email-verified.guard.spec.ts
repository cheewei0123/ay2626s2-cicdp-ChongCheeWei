import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EmailVerifiedGuard } from './email-verified.guard.js';

const prisma = { user: { findUnique: vi.fn() } };
const guard = new EmailVerifiedGuard(prisma as unknown as PrismaService);

// A fake request that JwtAuthGuard has already run on (or not)
const contextFor = (user?: { id: string; email: string }) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('EmailVerifiedGuard', () => {
  beforeEach(() => vi.resetAllMocks());

  it('lets a verified user through', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
    expect(
      await guard.canActivate(contextFor({ id: 'u1', email: 'a@b.c' })),
    ).toBe(true);
    expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'u1' });
  });

  it.each([
    ['an unverified user', { emailVerifiedAt: null }],
    ['a deleted account', null],
  ])('answers 403 for %s', async (_case, found) => {
    prisma.user.findUnique.mockResolvedValue(found);
    await expect(
      guard.canActivate(contextFor({ id: 'u1', email: 'a@b.c' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('answers 403 when no one is logged in', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      'Verify your email first',
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
