import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Use in a route behind ShareTokenGuard: the bill found from the share link
export const SharedBill = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<Request>().bill,
);
