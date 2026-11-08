import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  checkItemSplit,
  itemPortions,
  type SplitClaim,
  type SplitMode,
} from '../split/split.service.js';
import { assertOpen } from './bill-status.js';
import type { SetSplitDto } from './dto/set-split.dto.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';

// In these modes the values only add up for the people already on the item,
// so adding or removing someone puts the item back to an equal split
const needsReset = (mode: SplitMode) => mode === 'PERCENT' || mode === 'EXACT';

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
      select: { id: true, splitMode: true },
    });
    if (!item) throw new NotFoundException('Item not found on this bill');

    const key = { itemId_participantId: { itemId, participantId } };
    const existing = await this.prisma.claim.findUnique({ where: key });

    // Upsert = update if it exists, otherwise create. The unique (itemId, participantId)
    // index means tapping the same item twice can never make two claims.
    const claim = await this.prisma.claim.upsert({
      where: key,
      create: { itemId, participantId, shares },
      update: { shares },
    });
    if (!existing && needsReset(item.splitMode))
      await this.resetToEqual(itemId);
    return claim;
  }

  // "I didn't have this after all."
  async unclaim(bill: OwnedBill, participantId: string, itemId: string) {
    assertOpen(bill);
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, billId: bill.id },
      select: { splitMode: true },
    });
    const { count } = await this.prisma.claim.deleteMany({
      where: { itemId, participantId, item: { billId: bill.id } },
    });
    if (count === 0) {
      throw new NotFoundException('You have not claimed this item');
    }
    if (item && needsReset(item.splitMode)) await this.resetToEqual(itemId);
  }

  // Change how one item is shared: equal, shares, percent or exact amounts.
  // guestId is the guest making the change, or null when the owner does it.
  async setSplit(
    bill: OwnedBill,
    itemId: string,
    dto: SetSplitDto,
    guestId: string | null,
  ) {
    assertOpen(bill);
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, billId: bill.id },
      select: {
        id: true,
        unitPriceCents: true,
        quantity: true,
        claims: { select: { participantId: true, shares: true } },
      },
    });
    if (!item) throw new NotFoundException('Item not found on this bill');

    // Simple rule (written in docs/api.md): the owner, or anyone who claimed the item
    const claimers = new Map(item.claims.map((c) => [c.participantId, c]));
    if (guestId !== null && !claimers.has(guestId)) {
      throw new ForbiddenException(
        'Only people who claimed this item can change its split',
      );
    }
    // Everyone on the item needs a value, and nobody else may be added here
    const given = new Set(dto.entries.map((e) => e.participantId));
    if (
      given.size !== claimers.size ||
      [...given].some((id) => !claimers.has(id))
    ) {
      throw new BadRequestException(
        'entries must list exactly the people who claimed this item',
      );
    }

    const claims: SplitClaim[] = dto.entries.map((e) => ({
      itemId,
      participantId: e.participantId,
      shares: e.shares ?? claimers.get(e.participantId)!.shares,
      percentBp: e.percentBp ?? null,
      exactCents: e.exactCents ?? null,
    }));
    const splitItem = { ...item, splitMode: dto.splitMode };
    try {
      // Same rules as the split engine, e.g. EXACT must add up to the item's price
      checkItemSplit(splitItem, claims);
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    // All or nothing: the mode and every person's value change together
    await this.prisma.$transaction([
      this.prisma.item.update({
        where: { id: itemId },
        data: { splitMode: dto.splitMode },
      }),
      ...claims.map((c) =>
        this.prisma.claim.update({
          where: {
            itemId_participantId: { itemId, participantId: c.participantId },
          },
          data: {
            shares: c.shares,
            percentBp: c.percentBp,
            exactCents: c.exactCents,
          },
        }),
      ),
    ]);

    // Show each person's cents of this item, e.g. 70/30 of $16.00 → 1120 / 480
    const portions = itemPortions(splitItem, claims);
    return {
      itemId,
      splitMode: dto.splitMode,
      portions: claims.map((c) => ({
        participantId: c.participantId,
        cents: portions.get(c.participantId)!,
      })),
    };
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

  private resetToEqual(itemId: string) {
    return this.prisma.$transaction([
      this.prisma.item.update({
        where: { id: itemId },
        data: { splitMode: 'EQUAL' },
      }),
      this.prisma.claim.updateMany({
        where: { itemId },
        data: { percentBp: null, exactCents: null },
      }),
    ]);
  }
}
