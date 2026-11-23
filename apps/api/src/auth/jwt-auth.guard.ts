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
    // Any other kind of token (e.g. the half-way token while an MFA code is asked
    // for) isn't a login either
    if (payload.typ !== undefined) {
      throw new UnauthorizedException('This token cannot be used to log in');
    }
    // The login must still be live: one primary-key lookup. Logout ends this
    // session (KAN-97); a password change or reset raises sessionVersion, which
    // ends every session (KAN-90). Tokens from before sessions have no `sid`.
    const session = payload.sid
      ? await this.prisma.session.findUnique({
          where: { id: payload.sid },
          select: {
            userId: true,
            revokedAt: true,
            expiresAt: true,
            user: { select: { sessionVersion: true } },
          },
        })
      : null;
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.sessionVersion !== (payload.ver ?? 0)
    ) {
      throw new UnauthorizedException('Your session has ended. Log in again.');
    }
    req.user = {
      id: payload.sub,
      email: payload.email,
      sessionId: payload.sid!,
    };
    return true;
  }
}
