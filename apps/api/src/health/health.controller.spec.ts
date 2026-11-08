import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

// A fake database: $queryRaw is how the controller asks "are you there?"
const prisma = { $queryRaw: vi.fn() };
const controller = new HealthController(prisma as unknown as PrismaService);

describe('HealthController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('answers ok when the database replies', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    expect(await controller.check()).toEqual({ status: 'ok', db: 'up' });
  });

  it('answers 503 when the database is down, so the deploy can roll back', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(controller.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
