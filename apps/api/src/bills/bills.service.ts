import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { billTotals, formatCents } from '../split/money.js';
import type { CreateBillDto, UpdateBillDto } from './dto/bill.dto.js';
import type { CreateItemDto, UpdateItemDto } from './dto/item.dto.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';

type PricedItem = { unitPriceCents: number; quantity: number };
type BillWithItems = { serviceBp: number; gstBp: number; items: PricedItem[] };

// 16 random bytes → 22 URL-safe characters: impossible to guess, safe in a link
const newShareToken = () => randomBytes(16).toString('base64url');

// "2026-11-05" → Date; undefined stays undefined so Prisma leaves the field alone
const toDate = (date?: string) => (date ? new Date(date) : undefined);

// Adds the receipt totals (service then GST) in cents and as display text
function withTotals<T extends BillWithItems>(bill: T) {
  const subtotal = bill.items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const t = billTotals(subtotal, bill.serviceBp, bill.gstBp);
  return {
    ...bill,
    totals: {
      subtotalCents: t.subtotal,
      serviceCents: t.service,
      gstCents: t.gst,
      totalCents: t.total,
      total: formatCents(t.total),
    },
  };
}

// A bill can only change while it is OPEN; after locking, the split is final
function assertOpen(bill: OwnedBill) {
  if (bill.status !== 'OPEN') {
    throw new ConflictException('Bill is locked; unlock it to make changes');
  }
}

@Injectable()
export class BillsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateBillDto) {
    const bill = await this.prisma.bill.create({
      data: {
        ownerId,
        title: dto.title,
        merchant: dto.merchant ?? '',
        date: toDate(dto.date) ?? new Date(),
        serviceBp: dto.serviceBp,
        gstBp: dto.gstBp,
        shareToken: newShareToken(),
      },
      include: { items: true },
    });
    return withTotals(bill);
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
