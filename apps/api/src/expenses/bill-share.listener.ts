import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BILL_LOCKED, type BillLockedEvent } from '../bills/bill-events.js';
import { PrismaService } from '../prisma/prisma.service.js';

// When a bill is locked, each person with an account gets their share in "This month"
// without typing anything. Only the event's shape is shared with the bills code.
@Injectable()
export class BillShareListener {
  constructor(private readonly prisma: PrismaService) {}

  // suppressErrors: false sends a failure back to lock(), so the bill stays OPEN
  @OnEvent(BILL_LOCKED, { suppressErrors: false })
  async logShares(event: BillLockedEvent) {
    const owing = event.shares.filter((s) => s.amountCents > 0);

    await this.prisma.$transaction([
      // Someone who now owes nothing (e.g. their claim moved after an unlock) loses the row
      this.prisma.expense.deleteMany({
        where: {
          billId: event.billId,
          source: 'BILL_SHARE',
          userId: { notIn: owing.map((s) => s.userId) },
        },
      }),
      // One row per person per bill (unique userId + billId): locking again updates it.
      // Category and note are left alone on update, in case the person changed them.
      ...owing.map((s) =>
        this.prisma.expense.upsert({
          where: { userId_billId: { userId: s.userId, billId: event.billId } },
          create: {
            userId: s.userId,
            billId: event.billId,
            amountCents: s.amountCents,
            merchant: event.merchant,
            spentAt: event.date,
            category: 'FOOD_DRINKS', // a split bill is almost always a meal
            source: 'BILL_SHARE',
          },
          update: {
            amountCents: s.amountCents,
            merchant: event.merchant,
            spentAt: event.date,
          },
        }),
      ),
    ]);
  }
}
