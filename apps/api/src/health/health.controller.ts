import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';

// GET /api/health: "is the API up, and can it reach the database?"
// Used by the Docker HEALTHCHECK and by the deploy job before it switches traffic.
@SkipThrottle() // checked every few seconds, so it must never hit the rate limit
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      // The smallest possible query: proves the database answers
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503 = "not ready": the deploy treats this as a failed release
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ok', db: 'up' };
  }
}
