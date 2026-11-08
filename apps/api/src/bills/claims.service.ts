import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertOpen } from './bill-status.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';

@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  // "I had this." Shares default to 1, so two people on one item split it 50/50.
  async claim(
    bill: OwnedBill,
    participantId: string,
    itemId: string,
    shares = 1,
  ) {
    assertOpen(bill);
    // The item must belong to this bill, or a guest could claim items on other bills
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, billId: bill.id },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Item not found on this bill');

    // Upsert = update if it exists, otherwise create. The unique (itemId, participantId)
    // index means tapping the same item twice can never make two claims.
    return this.prisma.claim.upsert({
      where: { itemId_participantId: { itemId, participantId } },
      create: { itemId, participantId, shares },
      update: { shares },
    });
  }

  // "I didn't have this after all."
  async unclaim(bill: OwnedBill, participantId: string, itemId: string) {
    assertOpen(bill);
    const { count } = await this.prisma.claim.deleteMany({
      where: { itemId, participantId, item: { billId: bill.id } },
    });
    if (count === 0)
      throw new NotFoundException('You have not claimed this item');
  }

  // Lock = everyone is done; claims and items can't change any more
  async lock(bill: OwnedBill) {
    if (bill.status !== 'OPEN') {
      throw new ConflictException('Only an OPEN bill can be locked');
    }
    return this.setStatus(bill.id, 'LOCKED');
  }

  // Unlock = reopen for changes, e.g. someone forgot to claim an item
  async unlock(bill: OwnedBill) {
    if (bill.status !== 'LOCKED') {
      throw new ConflictException('Only a LOCKED bill can be unlocked');
    }
    return this.setStatus(bill.id, 'OPEN');
  }

  private setStatus(id: string, status: 'OPEN' | 'LOCKED') {
    return this.prisma.bill.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
  }
}
