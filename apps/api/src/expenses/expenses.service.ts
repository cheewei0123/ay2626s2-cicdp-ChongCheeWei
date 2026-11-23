import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Category, Expense } from '../generated/prisma/client.js';
import { OCR_SERVICE, type OcrService } from '../ocr/ocr.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatCents } from '../split/money.js';
import type {
  CreateExpenseDto,
  ListExpensesQueryDto,
  PeriodQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto.js';
import { merchantKey, ruleCategory } from './categorise.js';
import { currentMonth, dayRange, daysIn, monthRange } from './month.js';
import { summarise } from './summary.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_RANGE_DAYS = 366; // a year, leap years included

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

// Where a guessed category came from, checked in this order
export type CategorySource = 'memory' | 'ai' | 'rules' | 'none';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger('Categorise');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OCR_SERVICE) private readonly ocr: OcrService,
  ) {}

  // Every query includes userId, so one user can never see another's expenses.
  // label goes back in the answer: { month } or { from, to }, so the page knows what it got.
  private inPeriod(userId: string, query: PeriodQueryDto) {
    const { from, to } = query;
    if (from === undefined && to === undefined) {
      const month = query.month ?? currentMonth();
      const { start, end } = monthRange(month);
      return {
        label: { month },
        where: { userId, spentAt: { gte: start, lt: end } },
      };
    }
    if (from === undefined || to === undefined || query.month !== undefined)
      throw new BadRequestException('Send from and to together, without month');
    const days = daysIn(from, to);
    if (days < 1) throw new BadRequestException('to can’t be before from');
    if (days > MAX_RANGE_DAYS)
      throw new BadRequestException(
        `A range can be at most ${MAX_RANGE_DAYS} days`,
      );
    const { start, end } = dayRange(from, to);
    return {
      label: { from, to },
      where: { userId, spentAt: { gte: start, lt: end } },
    };
  }

  async list(userId: string, query: ListExpensesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { label, where } = this.inPeriod(userId, query);

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
    return { ...label, page, pageSize, totalCount, items: rows.map(toView) };
  }

  async summary(userId: string, query: PeriodQueryDto = {}) {
    const { label, where } = this.inPeriod(userId, query);
    const rows = await this.prisma.expense.findMany({
      where,
      select: { category: true, amountCents: true, spentAt: true },
    });
    return { ...label, ...summarise(rows) };
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

  // The best category for a merchant: what this user picked before, else the AI's
  // answer, else the keyword rules. OTHERS from the AI counts as no answer.
  async guessCategory(
    userId: string,
    merchant: string | undefined,
    aiCategory?: Category,
  ): Promise<{ category: Category; from: CategorySource }> {
    const key = merchant ? merchantKey(merchant) : '';
    if (key) {
      const remembered = await this.prisma.merchantCategory.findUnique({
        where: { userId_merchantKey: { userId, merchantKey: key } },
      });
      if (remembered) return { category: remembered.category, from: 'memory' };
    }
    if (aiCategory && aiCategory !== 'OTHERS') {
      return { category: aiCategory, from: 'ai' };
    }
    const rule = key ? ruleCategory(key) : undefined;
    if (rule) return { category: rule, from: 'rules' };
    return { category: 'OTHERS', from: 'none' };
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
    if (dto.category && dto.category !== expense.category) {
      await this.remember(userId, updated.merchant, dto.category);
      // One line per correction: counting them gives how often the guess was wrong
      this.logger.log(
        `category corrected from ${expense.category} to ${dto.category} (${expense.source})`,
      );
    }
    return toView(updated);
  }

  async remove(userId: string, id: string) {
    const expense = await this.findMine(userId, id);
    if (expense.source === 'BILL_SHARE') {
      throw new ConflictException(
        'This is your share of a bill, so it changes with the bill. Ask the owner to change your claims.',
      );
    }
    await this.prisma.expense.delete({ where: { id } });
  }

  // A changed category is remembered for that merchant, so next time it is right
  private async remember(
    userId: string,
    merchant: string | null,
    category: Category,
  ) {
    const key = merchant ? merchantKey(merchant) : '';
    if (!key) return;
    await this.prisma.merchantCategory.upsert({
      where: { userId_merchantKey: { userId, merchantKey: key } },
      create: { userId, merchantKey: key, category },
      update: { category },
    });
  }

  // POST /api/expenses/receipt: a draft for the user to check, nothing is saved
  async draftFromPhoto(userId: string, image: Buffer, mimeType: string) {
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
    const guess = await this.guessCategory(
      userId,
      receipt.merchant,
      receipt.category,
    );
    return {
      amountCents,
      amount: formatCents(amountCents),
      merchant: receipt.merchant ?? null,
      category: guess.category,
      categoryFrom: guess.from,
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
