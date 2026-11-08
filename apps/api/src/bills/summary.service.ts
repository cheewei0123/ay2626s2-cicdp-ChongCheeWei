import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { billTotals, formatCents } from '../split/money.js';
import { SplitService } from '../split/split.service.js';

// What each person owes. Built from the database, worked out by the tested split engine.
@Injectable()
export class SummaryService {
  // SplitService comes from SplitModule (imported by BillsModule): DI across modules
  constructor(
    private readonly prisma: PrismaService,
    private readonly split: SplitService,
  ) {}

  async forBill(billId: string, options: { withPaynow?: boolean } = {}) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      select: {
        ownerId: true,
        serviceBp: true,
        gstBp: true,
        owner: { select: { displayName: true, paynowMobile: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            unitPriceCents: true,
            quantity: true,
            splitMode: true,
            claims: {
              select: {
                participantId: true,
                shares: true,
                percentBp: true,
                exactCents: true,
              },
            },
          },
        },
        participants: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            displayName: true,
            userId: true,
            payment: { select: { paidAt: true } },
          },
        },
      },
    });
    if (!bill) throw new NotFoundException('Bill not found');

    // Unclaimed items go to the owner, so the owner must be a participant.
    // Bills made before this existed have none yet, so it is created the first time.
    let people = bill.participants;
    let owner = people.find((p) => p.userId === bill.ownerId);
    if (!owner) {
      const created = await this.prisma.participant.create({
        data: {
          billId,
          displayName: bill.owner.displayName,
          userId: bill.ownerId,
        },
        select: { id: true },
      });
      owner = {
        id: created.id,
        displayName: bill.owner.displayName,
        userId: bill.ownerId,
        payment: null,
      };
      people = [...people, owner];
    }
    const ownerId = owner.id;
    // Owner first (the person everyone pays), then guests in the order they joined
    people = [owner, ...people.filter((p) => p.id !== ownerId)];

    // Database rows → split engine input (the engine knows nothing about Prisma)
    const result = this.split.split({
      items: bill.items.map((i) => ({
        id: i.id,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        splitMode: i.splitMode,
      })),
      claims: bill.items.flatMap((i) =>
        i.claims.map((c) => ({ itemId: i.id, ...c })),
      ),
      serviceBp: bill.serviceBp,
      gstBp: bill.gstBp,
      ownerParticipantId: ownerId,
    });

    const subtotal = bill.items.reduce(
      (sum, i) => sum + i.unitPriceCents * i.quantity,
      0,
    );
    const totals = billTotals(subtotal, bill.serviceBp, bill.gstBp);
    const shares = new Map(result.people.map((p) => [p.participantId, p]));

    const summary = {
      subtotalCents: totals.subtotal,
      serviceCents: totals.service,
      gstCents: totals.gst,
      totalCents: totals.total,
      total: formatCents(totals.total),
      unclaimedCents: result.unclaimedCents,
      // Someone who claimed nothing still appears, owing 0
      people: people.map((p) => {
        const s = shares.get(p.id);
        const totalCents = s?.totalCents ?? 0;
        return {
          participantId: p.id,
          displayName: p.displayName,
          isOwner: p.id === ownerId,
          itemsCents: s?.itemsCents ?? 0,
          serviceCents: s?.serviceCents ?? 0,
          gstCents: s?.gstCents ?? 0,
          totalCents,
          total: formatCents(totalCents),
          paid: p.payment?.paidAt != null,
        };
      }),
    };

    // Guests need the owner's PayNow number to pay them back; the owner doesn't
    return options.withPaynow
      ? { ...summary, paynow: { mobile: bill.owner.paynowMobile } }
      : summary;
  }
}
