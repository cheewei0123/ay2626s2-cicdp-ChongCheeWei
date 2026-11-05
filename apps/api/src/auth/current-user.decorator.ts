import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Use in a route behind JwtAuthGuard: `me(@CurrentUser() user: AuthUser)`
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<Request>().user,
);
