import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';

// For guest routes (/api/share/:token/...). No login: the share link itself is the
// permission. Anyone with the link can see the bill, so the token must be unguessable.
@Injectable()
export class ShareTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.params.token;
    if (typeof token !== 'string')
      throw new NotFoundException('Bill not found');

    const bill = await this.prisma.bill.findUnique({
      where: { shareToken: token },
      select: { id: true, ownerId: true, status: true },
    });
    if (!bill) throw new NotFoundException('Bill not found');

    // Same shape BillOwnerGuard uses, read with @SharedBill()
    req.bill = bill;
    return true;
  }
}
