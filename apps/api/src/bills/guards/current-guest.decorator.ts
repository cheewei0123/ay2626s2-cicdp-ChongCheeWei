import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Use in a route behind GuestTokenGuard: `claim(@CurrentGuest() guest: Guest, ...)`
export const CurrentGuest = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<Request>().guest,
);
