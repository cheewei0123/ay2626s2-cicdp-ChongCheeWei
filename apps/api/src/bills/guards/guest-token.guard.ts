import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { GuestPayload, JwtPayload } from '../../auth/auth-user.js';

// Who the guest is, after the token is checked
export interface Guest {
  participantId: string;
  billId: string;
}

// Lets TypeScript know that `req.guest` can exist on an Express request
declare module 'express-serve-static-core' {
  interface Request {
    guest?: Guest;
  }
}

// Use after ShareTokenGuard: @UseGuards(ShareTokenGuard, GuestTokenGuard).
// The share link says WHICH bill; the guest token (from joining) says WHO you are,
// so a guest can only claim items as themselves.
@Injectable()
export class GuestTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-guest-token'];
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException(
        'Join the bill first to get a guest token',
      );
    }

    let payload: GuestPayload | JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<GuestPayload | JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired guest token');
    }
    // A login token has the same signature, so check it really is a guest token
    if (payload.typ !== 'guest') {
      throw new UnauthorizedException(
        'Join the bill first to get a guest token',
      );
    }
    // A guest of one bill can't use their token on another bill's link
    if (payload.billId !== req.bill?.id) {
      throw new ForbiddenException('This guest token is for a different bill');
    }

    req.guest = { participantId: payload.sub, billId: payload.billId };
    return true;
  }
}
