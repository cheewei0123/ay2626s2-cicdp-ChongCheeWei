import { ExecutionContext, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ShareTokenGuard } from './share-token.guard.js';

// A fake database that knows one share token
const bill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };
const prisma = { bill: { findUnique: vi.fn() } };
const guard = new ShareTokenGuard(prisma as unknown as PrismaService);

// A mocked ExecutionContext with only route params: guests are not logged in
function contextFor(params: Record<string, unknown>) {
  const req = { params } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, context };
}

describe('ShareTokenGuard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.bill.findUnique.mockImplementation(({ where }) =>
      where.shareToken === 'good-token' ? bill : null,
    );
  });

  it('finds the bill by its share token and puts it on the request', async () => {
    const { req, context } = contextFor({ token: 'good-token' });
    expect(await guard.canActivate(context)).toBe(true);
    expect(req.bill).toEqual(bill);
  });

  it('answers 404 for a wrong token', async () => {
    await expect(
      guard.canActivate(contextFor({ token: 'guessed' }).context),
    ).rejects.toThrow(NotFoundException);
  });

  it.each([[{}], [{ token: ['a', 'b'] }]])(
    'answers 404 without a single token %o',
    async (params) => {
      await expect(
        guard.canActivate(contextFor(params).context),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.bill.findUnique).not.toHaveBeenCalled();
    },
  );
});
