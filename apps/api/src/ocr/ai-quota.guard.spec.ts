import { ExecutionContext, HttpException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AiQuotaGuard, singaporeDay } from './ai-quota.guard.js';

const prisma = { aiScanCount: { upsert: vi.fn() } };
const guard = new AiQuotaGuard(prisma as unknown as PrismaService);
const context = {
  switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }),
} as unknown as ExecutionContext;

describe('singaporeDay', () => {
  it('rolls over at midnight in Singapore, not at midnight UTC', () => {
    // 15:59 UTC is 23:59 in Singapore; 16:00 UTC is already the next day there
    expect(singaporeDay(new Date('2026-11-23T15:59:00Z'))).toEqual(
      new Date('2026-11-23'),
    );
    expect(singaporeDay(new Date('2026-11-23T16:00:00Z'))).toEqual(
      new Date('2026-11-24'),
    );
  });
});

describe('AiQuotaGuard', () => {
  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.AI_DAILY_LIMIT;
  });

  it('counts the scan for this user today and lets it through', async () => {
    prisma.aiScanCount.upsert.mockResolvedValue({ count: 1 });
    expect(await guard.canActivate(context)).toBe(true);
    expect(prisma.aiScanCount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'u1', count: 1 }),
        update: { count: { increment: 1 } },
      }),
    );
  });

  it('allows exactly the limit, then answers 429 with a clear message', async () => {
    process.env.AI_DAILY_LIMIT = '3';
    prisma.aiScanCount.upsert.mockResolvedValue({ count: 3 });
    expect(await guard.canActivate(context)).toBe(true);

    prisma.aiScanCount.upsert.mockResolvedValue({ count: 4 });
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toContain('all 3 receipt scans');
  });

  it('uses 20 a day when AI_DAILY_LIMIT is not a number', async () => {
    process.env.AI_DAILY_LIMIT = 'lots';
    prisma.aiScanCount.upsert.mockResolvedValue({ count: 20 });
    expect(await guard.canActivate(context)).toBe(true);
    prisma.aiScanCount.upsert.mockResolvedValue({ count: 21 });
    await expect(guard.canActivate(context)).rejects.toThrow('all 20');
  });
});
