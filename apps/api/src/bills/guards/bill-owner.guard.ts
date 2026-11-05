import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { BillStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// The few bill fields the guard loads; routes use them without loading the bill again
export interface OwnedBill {
  id: string;
  ownerId: string;
  status: BillStatus;
}

// Lets TypeScript know that `req.bill` can exist on an Express request
declare module 'express-serve-static-core' {
  interface Request {
    bill?: OwnedBill;
  }
}

// Use after JwtAuthGuard: @UseGuards(JwtAuthGuard, BillOwnerGuard).
// Guards run in that order, so req.user is already set when this one runs.
@Injectable()
export class BillOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    // Bill routes use :id, item routes use :billId. Express types a param as
    // string | string[], so anything that is not one string counts as "no bill".
    const param = req.params.id ?? req.params.billId;
    const billId = typeof param === 'string' ? param : undefined;
    if (!billId) throw new NotFoundException('Bill not found');

    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.ownerId !== req.user?.id) {
      throw new ForbiddenException('Only the owner of this bill can do this');
    }

    req.bill = bill;
    return true;
  }
}
