import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { GuestPayload } from '../auth/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';
import { normaliseJoinCode, uniqueName } from './join-code.js';
import { withTotals } from './totals.js';

@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // What a guest sees. `select` lists every field allowed out, so new private
  // fields (owner email, user IDs, share token) can never leak by accident.
  async view(billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      select: {
        title: true,
        merchant: true,
        date: true,
        serviceBp: true,
        gstBp: true,
        status: true,
        joinCode: true,
        owner: { select: { displayName: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
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
          select: { id: true, displayName: true },
        },
      },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    return withTotals(bill);
  }

  async join(bill: OwnedBill, displayName: string) {
    if (bill.status !== 'OPEN') {
      throw new ConflictException(
        'This bill is locked and can no longer be joined',
      );
    }
    const existing = await this.prisma.participant.findMany({
      where: { billId: bill.id },
      select: { displayName: true },
    });
    const participant = await this.prisma.participant.create({
      data: {
        billId: bill.id,
        displayName: uniqueName(
          displayName,
          existing.map((p) => p.displayName),
        ),
      },
      select: { id: true, displayName: true },
    });

    // The guest keeps this token and sends it with later calls, so nobody can
    // claim items as someone else. `typ: 'guest'` stops it working as a login.
    const payload: GuestPayload = {
      sub: participant.id,
      billId: bill.id,
      typ: 'guest',
    };
    const guestToken = await this.jwt.signAsync(payload, { expiresIn: '24h' });
    return { participant, guestToken };
  }

  // GET /api/join/:code → the share token, so the app can open /share/:token
  async shareTokenFor(input: string) {
    const code = normaliseJoinCode(input);
    if (!code) throw new NotFoundException('No bill with this code');

    const bill = await this.prisma.bill.findUnique({
      where: { joinCode: code },
      select: { shareToken: true, status: true },
    });
    // A settled bill is finished, so its code stops working
    if (!bill || bill.status === 'SETTLED') {
      throw new NotFoundException('No bill with this code');
    }
    return { shareToken: bill.shareToken };
  }
}
