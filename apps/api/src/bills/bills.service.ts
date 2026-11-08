import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertOpen } from './bill-status.js';
import type { CreateBillDto, UpdateBillDto } from './dto/bill.dto.js';
import type { CreateItemDto, UpdateItemDto } from './dto/item.dto.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';
import { newJoinCode } from './join-code.js';
import { withTotals } from './totals.js';

// 16 random bytes → 22 URL-safe characters: impossible to guess, safe in a link
const newShareToken = () => randomBytes(16).toString('base64url');

// "2026-11-05" → Date; undefined stays undefined so Prisma leaves the field alone
const toDate = (date?: string) => (date ? new Date(date) : undefined);

// Join codes are short, so two bills can (rarely) get the same one. The database's
// unique index rejects it (P2002), and we simply try again with a new code.
const MAX_CODE_TRIES = 5;

@Injectable()
export class BillsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateBillDto) {
    for (let attempt = 1; ; attempt++) {
      try {
        const bill = await this.prisma.bill.create({
          data: {
            ownerId,
            title: dto.title,
            merchant: dto.merchant ?? '',
            date: toDate(dto.date) ?? new Date(),
            serviceBp: dto.serviceBp,
            gstBp: dto.gstBp,
            shareToken: newShareToken(),
            joinCode: newJoinCode(),
          },
          include: { items: true },
        });
        return withTotals(bill);
      } catch (error) {
        const clash =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!clash || attempt >= MAX_CODE_TRIES) throw error;
      }
    }
  }

  async listMine(ownerId: string) {
    const bills = await this.prisma.bill.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return bills.map(withTotals);
  }

  // BillOwnerGuard has already checked that the bill exists and belongs to this user
  async getDetails(id: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: {
        items: { orderBy: { createdAt: 'asc' }, include: { claims: true } },
        participants: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    return withTotals(bill);
  }

  async update(bill: OwnedBill, dto: UpdateBillDto) {
    assertOpen(bill);
    const updated = await this.prisma.bill.update({
      where: { id: bill.id },
      data: { ...dto, date: toDate(dto.date) },
      include: { items: true },
    });
    return withTotals(updated);
  }

  async addItem(bill: OwnedBill, dto: CreateItemDto) {
    assertOpen(bill);
    return this.prisma.item.create({
      data: {
        billId: bill.id,
        name: dto.name,
        unitPriceCents: dto.unitPriceCents,
        quantity: dto.quantity,
      },
    });
  }

  // `billId` in the where means an item from another bill is "not found" (P2025 → 404)
  async updateItem(bill: OwnedBill, itemId: string, dto: UpdateItemDto) {
    assertOpen(bill);
    return this.prisma.item.update({
      where: { id: itemId, billId: bill.id },
      data: dto,
    });
  }

  async deleteItem(bill: OwnedBill, itemId: string) {
    assertOpen(bill);
    await this.prisma.item.delete({ where: { id: itemId, billId: bill.id } });
  }
}
