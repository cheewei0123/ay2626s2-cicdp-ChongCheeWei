import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

// Use after JwtAuthGuard: @UseGuards(JwtAuthGuard, EmailVerifiedGuard).
// Checks the database, not the login token, so it lets you in the moment you verify.
// Needs only PrismaService (global), so any module can use it without importing AuthModule.
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<Request>();
    const found = user
      ? await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { emailVerifiedAt: true },
        })
      : null;
    if (found?.emailVerifiedAt) return true;
    throw new ForbiddenException(
      'Verify your email first: open the link we sent you, or ask for a new one.',
    );
  }
}
