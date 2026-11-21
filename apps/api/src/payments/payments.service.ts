import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OwnedBill } from '../bills/guards/bill-owner.guard.js';
import { SummaryService } from '../bills/summary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// The owner keeps track of who has paid them back. This only records what people
// say they paid; SplitLah never moves money.
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly summary: SummaryService,
  ) {}

  async markPaid(bill: OwnedBill, participantId: string, paid: boolean) {
    // While the bill is open, amounts can still change
    if (bill.status === 'OPEN') {
      throw new ConflictException('Lock the bill before marking payments');
    }

    // Who owes what right now, from the tested split engine
    const { people } = await this.summary.forBill(bill.id);
    const person = people.find((p) => p.participantId === participantId);
    if (!person) throw new NotFoundException('Person not found on this bill');
    if (person.isOwner) {
      throw new BadRequestException("The owner doesn't pay themselves");
    }

    // amountCents is a snapshot, so later edits can't silently change what was paid
    const paidAt = paid ? new Date() : null;
    await this.prisma.payment.upsert({
      where: { participantId },
      create: {
        billId: bill.id,
        participantId,
        amountCents: person.totalCents,
        paidAt,
      },
      update: { amountCents: person.totalCents, paidAt },
    });

    // Everyone who owes something has paid → SETTLED; untick someone → back to LOCKED
    const owing = people.filter((p) => !p.isOwner && p.totalCents > 0);
    const isPaid = (p: (typeof people)[number]) =>
      p.participantId === participantId ? paid : p.paid;
    const status =
      owing.length > 0 && owing.every(isPaid) ? 'SETTLED' : 'LOCKED';
    if (status !== bill.status) {
      await this.prisma.bill.update({
        where: { id: bill.id },
        data: { status },
      });
    }

    return {
      participantId,
      paid,
      amountCents: person.totalCents,
      paidCount: owing.filter(isPaid).length,
      owingCount: owing.length,
      status,
    };
  }
}
