import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Use in a route behind BillOwnerGuard: `update(@OwnedBill() bill: OwnedBill, ...)`
export const OwnedBill = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<Request>().bill,
);
