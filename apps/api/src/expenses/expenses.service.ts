import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Expense } from '../generated/prisma/client.js';
import { OCR_SERVICE, type OcrService } from '../ocr/ocr.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatCents } from '../split/money.js';
import type {
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto.js';
import { currentMonth, monthRange } from './month.js';
import { summarise } from './summary.js';

const DEFAULT_PAGE_SIZE = 50;

// What the API returns for an expense: money also as text, and never the userId
function toView(e: Expense) {
  return {
    id: e.id,
    amountCents: e.amountCents,
    amount: formatCents(e.amountCents),
    category: e.category,
    merchant: e.merchant,
    note: e.note,
    spentAt: e.spentAt,
    source: e.source,
    billId: e.billId,
    createdAt: e.createdAt,
  };
}

// "2026-11-05" or "2026-11-05T19:30:00+08:00" → Date; undefined leaves the field alone
const toDate = (date?: string) => (date ? new Date(date) : undefined);

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OCR_SERVICE) private readonly ocr: OcrService,
  ) {}

  // Every query includes userId, so one user can never see another's expenses
  private inMonth(userId: string, month: string) {
    const { start, end } = monthRange(month);
    return { userId, spentAt: { gte: start, lt: end } };
  }

  async list(userId: string, query: ListExpensesQueryDto) {
    const month = query.month ?? currentMonth();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.inMonth(userId, month);

    const [totalCount, rows] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        // Newest first; createdAt and id break ties so pages never overlap
        orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { month, page, pageSize, totalCount, items: rows.map(toView) };
  }

  async summary(userId: string, month = currentMonth()) {
    const rows = await this.prisma.expense.findMany({
      where: this.inMonth(userId, month),
      select: { category: true, amountCents: true },
    });
    return { month, ...summarise(rows) };
  }

  async create(userId: string, dto: CreateExpenseDto) {
    const expense = await this.prisma.expense.create({
      data: {
        userId,
        amountCents: dto.amountCents,
        category: dto.category,
        merchant: dto.merchant,
        note: dto.note,
        spentAt: new Date(dto.spentAt),
        source: dto.source ?? 'MANUAL',
      },
    });
    return toView(expense);
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    const expense = await this.findMine(userId, id);
    // A bill share must match the locked bill; only its category and note are personal
    const fromBill =
      dto.amountCents !== undefined ||
      dto.merchant !== undefined ||
      dto.spentAt !== undefined;
    if (expense.source === 'BILL_SHARE' && fromBill) {
      throw new ConflictException(
        'A bill share’s amount, merchant and date come from the bill. Unlock the bill to change them.',
      );
    }
    const updated = await this.prisma.expense.update({
      where: { id },
      data: { ...dto, spentAt: toDate(dto.spentAt) },
    });
    return toView(updated);
  }

  async remove(userId: string, id: string) {
    const expense = await this.findMine(userId, id);
    if (expense.source === 'BILL_SHARE') {
      throw new ConflictException(
        'This is your share of a locked bill. Unlock the bill to remove it.',
      );
    }
    await this.prisma.expense.delete({ where: { id } });
  }

  // POST /api/expenses/receipt: a draft for the user to check, nothing is saved
  async draftFromPhoto(image: Buffer, mimeType: string) {
    const receipt = await this.ocr.extract(image, mimeType);
    const itemsCents = receipt.items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0,
    );
    // Prefer the printed total (it includes service and GST); else add up the items
    const amountCents = receipt.totalCents ?? itemsCents;
    if (amountCents < 1) {
      throw new UnprocessableEntityException(
        'No amount found on this receipt. Add the expense by hand.',
      );
    }
    return {
      amountCents,
      amount: formatCents(amountCents),
      merchant: receipt.merchant ?? null,
      category: receipt.category ?? 'OTHERS',
      spentAt: receipt.date ?? null, // the app fills in today if the date wasn't read
      source: 'RECEIPT' as const,
    };
  }

  // Someone else's expense looks exactly like a missing one (404), so IDs can't be probed
  private async findMine(userId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, userId },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }
}
