import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import type { GuestPayload, JwtPayload } from './auth-user.js';

// Put @UseGuards(JwtAuthGuard) on a controller or route to require a valid login token
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    // Expected header: "Authorization: Bearer <token>"
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing login token');
    }

    let payload: JwtPayload | GuestPayload;
    try {
      // Checks the signature (made with JWT_SECRET) and the expiry time
      payload = await this.jwt.verifyAsync<JwtPayload | GuestPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired login token');
    }
    // Guest tokens are signed with the same secret, so they must be refused here:
    // a guest is not a user and must never reach /me or someone's bills
    if (payload.typ === 'guest') {
      throw new UnauthorizedException('A guest token cannot be used to log in');
    }
    // The token must still match the account: one primary-key lookup. A password
    // change (or reset) raises sessionVersion, which logs out every other device (KAN-90).
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { sessionVersion: true },
    });
    if (!user || user.sessionVersion !== (payload.ver ?? 0)) {
      throw new UnauthorizedException('Your session has ended. Log in again.');
    }
    req.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
