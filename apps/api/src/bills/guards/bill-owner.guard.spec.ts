import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { BillOwnerGuard } from './bill-owner.guard.js';

// A fake database that knows one bill, owned by u1
const bill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };
const prisma = { bill: { findUnique: vi.fn() } };
const guard = new BillOwnerGuard(prisma as unknown as PrismaService);

// A mocked ExecutionContext: a request with a logged-in user and route params
function contextFor(userId: string, params: Record<string, string>) {
  const req = {
    user: { id: userId, email: 'x' },
    params,
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, context };
}

describe('BillOwnerGuard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.bill.findUnique.mockImplementation(({ where }) =>
      where.id === 'b1' ? bill : null,
    );
  });

  it('lets the owner through and puts the bill on the request', async () => {
    const { req, context } = contextFor('u1', { id: 'b1' });
    expect(await guard.canActivate(context)).toBe(true);
    expect(req.bill).toEqual(bill);
  });

  it('also reads the bill id from :billId (item routes)', async () => {
    const { context } = contextFor('u1', { billId: 'b1', itemId: 'i1' });
    expect(await guard.canActivate(context)).toBe(true);
    expect(prisma.bill.findUnique.mock.calls[0][0].where).toEqual({ id: 'b1' });
  });

  it('answers 403 for another user', async () => {
    const { req, context } = contextFor('u2', { id: 'b1' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(req.bill).toBeUndefined();
  });

  it('answers 404 for a bill that does not exist', async () => {
    await expect(
      guard.canActivate(contextFor('u1', { id: 'nope' }).context),
    ).rejects.toThrow(NotFoundException);
  });

  it('answers 404 when the bill id is not a single string', async () => {
    const { context } = contextFor('u1', {});
    context.switchToHttp().getRequest<Request>().params = {
      id: ['b1', 'b2'],
    } as unknown as Request['params'];
    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    expect(prisma.bill.findUnique).not.toHaveBeenCalled();
  });

  it('answers 404 when the route has no bill id', async () => {
    await expect(
      guard.canActivate(contextFor('u1', {}).context),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.bill.findUnique).not.toHaveBeenCalled();
  });
});
