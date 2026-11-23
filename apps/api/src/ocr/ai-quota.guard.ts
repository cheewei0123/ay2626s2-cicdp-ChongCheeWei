import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

const DEFAULT_LIMIT = 20;
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000; // Singapore is UTC+8 all year

// Today's date in Singapore, as midnight UTC (the shape a Postgres DATE column takes)
export function singaporeDay(now = new Date()): Date {
  const local = new Date(now.getTime() + SGT_OFFSET_MS);
  return new Date(local.toISOString().slice(0, 10));
}

// Every AI scan uses Gemini quota. The per-IP throttle (5 a minute) stops bursts;
// this caps each account per day, so one user can't use up the whole quota (KAN-88).
// Use after JwtAuthGuard, so req.user is set.
@Injectable()
export class AiQuotaGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.user!.id;
    const limit = Number(process.env.AI_DAILY_LIMIT) || DEFAULT_LIMIT;
    const day = singaporeDay();

    // One atomic statement: two scans at the same moment can't both slip under the cap
    const { count } = await this.prisma.aiScanCount.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    if (count > limit) {
      throw new HttpException(
        `You have used all ${limit} receipt scans for today. Type it in, or scan again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
