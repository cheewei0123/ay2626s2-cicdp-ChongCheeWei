import {
  ConflictException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FakeOcrService } from '../ocr/fake-ocr.service.js';
import type { OcrResult, OcrService } from '../ocr/ocr.interface.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ExpensesService } from './expenses.service.js';

// A saved row, as Prisma returns it
const row = (fields: Record<string, unknown> = {}) => ({
  id: 'e1',
  userId: 'u1',
  amountCents: 1250,
  category: 'FOOD_DRINKS',
  merchant: 'Maxwell',
  note: null,
  spentAt: new Date('2026-11-05T04:00:00.000Z'),
  source: 'MANUAL',
  billId: null,
  createdAt: new Date('2026-11-05T04:00:01.000Z'),
  updatedAt: new Date('2026-11-05T04:00:01.000Z'),
  ...fields,
});

// What the API sends back for that row: money also as text, and no userId
const view = {
  id: 'e1',
  amountCents: 1250,
  amount: '$12.50',
  category: 'FOOD_DRINKS',
  merchant: 'Maxwell',
  note: null,
  spentAt: new Date('2026-11-05T04:00:00.000Z'),
  source: 'MANUAL',
  billId: null,
  createdAt: new Date('2026-11-05T04:00:01.000Z'),
};

const november = {
  gte: new Date('2026-10-31T16:00:00.000Z'),
  lt: new Date('2026-11-30T16:00:00.000Z'),
};

function readerOf(receipt: Omit<OcrResult, 'raw'>): OcrService {
  return { provider: 'stub', extract: async () => ({ ...receipt, raw: {} }) };
}

describe('ExpensesService (mocked database)', () => {
  const prisma = {
    expense: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    merchantCategory: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  const service = (ocr: OcrService = new FakeOcrService()) =>
    new ExpensesService(prisma as unknown as PrismaService, ocr);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.useRealTimers());

  describe('list', () => {
    it('returns one page of my expenses in that month, newest first', async () => {
      prisma.expense.count.mockResolvedValue(1);
      prisma.expense.findMany.mockResolvedValue([row()]);

      const page = await service().list('u1', { month: '2026-11' });

      const where = { userId: 'u1', spentAt: november };
      expect(prisma.expense.count).toHaveBeenCalledWith({ where });
      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where,
        orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
      });
      expect(page).toEqual({
        month: '2026-11',
        page: 1,
        pageSize: 50,
        totalCount: 1,
        items: [view],
      });
    });

    it('skips the earlier pages', async () => {
      prisma.expense.count.mockResolvedValue(25);
      prisma.expense.findMany.mockResolvedValue([]);

      await service().list('u1', { month: '2026-11', page: 3, pageSize: 10 });

      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('uses the current Singapore month when no month is given', async () => {
      vi.useFakeTimers({ now: new Date('2026-11-30T16:30:00.000Z') }); // 1 Dec in Singapore
      prisma.expense.count.mockResolvedValue(0);
      prisma.expense.findMany.mockResolvedValue([]);

      const page = await service().list('u1', {});

      expect(page.month).toBe('2026-12');
    });
  });

  describe('summary', () => {
    it('adds up my expenses in that month by category', async () => {
      prisma.expense.findMany.mockResolvedValue([
        { category: 'FOOD_DRINKS', amountCents: 720 },
        { category: 'FOOD_DRINKS', amountCents: 1250 },
      ]);

      const summary = await service().summary('u1', '2026-11');

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', spentAt: november },
        select: { category: true, amountCents: true },
      });
      expect(summary).toEqual({
        month: '2026-11',
        totalCents: 1970,
        total: '$19.70',
        byCategory: [
          {
            category: 'FOOD_DRINKS',
            totalCents: 1970,
            total: '$19.70',
            count: 2,
          },
        ],
      });
    });

    it('uses the current Singapore month when no month is given', async () => {
      vi.useFakeTimers({ now: new Date('2026-11-05T00:00:00.000Z') });
      prisma.expense.findMany.mockResolvedValue([]);

      expect((await service().summary('u1')).month).toBe('2026-11');
    });
  });

  describe('create', () => {
    it('saves a manual expense for me', async () => {
      prisma.expense.create.mockResolvedValue(row());

      const created = await service().create('u1', {
        amountCents: 1250,
        category: 'FOOD_DRINKS',
        merchant: 'Maxwell',
        spentAt: '2026-11-05T12:00:00+08:00',
      });

      expect(prisma.expense.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          amountCents: 1250,
          category: 'FOOD_DRINKS',
          merchant: 'Maxwell',
          note: undefined,
          spentAt: new Date('2026-11-05T04:00:00.000Z'),
          source: 'MANUAL',
        },
      });
      expect(created).toEqual(view);
    });

    it('keeps RECEIPT when the expense came from a scanned receipt', async () => {
      prisma.expense.create.mockResolvedValue(row({ source: 'RECEIPT' }));

      await service().create('u1', {
        amountCents: 1250,
        category: 'FOOD_DRINKS',
        spentAt: '2026-11-05',
        source: 'RECEIPT',
      });

      expect(prisma.expense.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'RECEIPT' }),
      });
    });
  });

  describe('update', () => {
    it('only finds the expense among my own (someone else’s is 404)', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(
        service().update('u2', 'e1', { amountCents: 1 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.expense.findFirst).toHaveBeenCalledWith({
        where: { id: 'e1', userId: 'u2' },
      });
      expect(prisma.expense.update).not.toHaveBeenCalled();
    });

    it('changes the fields that were sent', async () => {
      prisma.expense.findFirst.mockResolvedValue(row());
      prisma.expense.update.mockResolvedValue(
        row({
          amountCents: 900,
          spentAt: new Date('2026-11-06T00:00:00.000Z'),
        }),
      );

      const updated = await service().update('u1', 'e1', {
        amountCents: 900,
        spentAt: '2026-11-06',
      });

      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          amountCents: 900,
          spentAt: new Date('2026-11-06T00:00:00.000Z'),
        },
      });
      expect(updated).toMatchObject({ amountCents: 900, amount: '$9.00' });
    });

    it('lets me recategorise a bill share', async () => {
      prisma.expense.findFirst.mockResolvedValue(
        row({ source: 'BILL_SHARE', billId: 'b1' }),
      );
      prisma.expense.update.mockResolvedValue(
        row({ source: 'BILL_SHARE', billId: 'b1', category: 'GIFTS' }),
      );

      await service().update('u1', 'e1', { category: 'GIFTS', note: 'treat' });

      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { category: 'GIFTS', note: 'treat' },
      });
    });

    it('remembers a changed category for that merchant, and logs the correction', async () => {
      prisma.expense.findFirst.mockResolvedValue(
        row({ merchant: 'STARBUCKS Coffee!', category: 'GIFTS' }),
      );
      prisma.expense.update.mockResolvedValue(
        row({ merchant: 'STARBUCKS Coffee!', category: 'FOOD_DRINKS' }),
      );

      await service().update('u1', 'e1', { category: 'FOOD_DRINKS' });

      expect(prisma.merchantCategory.upsert).toHaveBeenCalledWith({
        where: {
          userId_merchantKey: { userId: 'u1', merchantKey: 'starbucks coffee' },
        },
        create: {
          userId: 'u1',
          merchantKey: 'starbucks coffee',
          category: 'FOOD_DRINKS',
        },
        update: { category: 'FOOD_DRINKS' },
      });
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        'category corrected from GIFTS to FOOD_DRINKS (MANUAL)',
      );
    });

    it('remembers nothing when the category is unchanged or there is no merchant', async () => {
      prisma.expense.findFirst.mockResolvedValue(row());
      prisma.expense.update.mockResolvedValue(row());
      await service().update('u1', 'e1', { category: 'FOOD_DRINKS' });

      prisma.expense.findFirst.mockResolvedValue(row({ merchant: null }));
      prisma.expense.update.mockResolvedValue(
        row({ merchant: null, category: 'GIFTS' }),
      );
      await service().update('u1', 'e1', { category: 'GIFTS' });

      expect(prisma.merchantCategory.upsert).not.toHaveBeenCalled();
    });

    it.each([
      { amountCents: 1 },
      { merchant: 'Other' },
      { spentAt: '2026-11-06' },
    ])(
      'refuses to change a bill share’s amount, merchant or date: %o',
      async (dto) => {
        prisma.expense.findFirst.mockResolvedValue(
          row({ source: 'BILL_SHARE', billId: 'b1' }),
        );

        await expect(service().update('u1', 'e1', dto)).rejects.toThrow(
          ConflictException,
        );
        expect(prisma.expense.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('remove', () => {
    it('deletes my manual expense', async () => {
      prisma.expense.findFirst.mockResolvedValue(row());

      await service().remove('u1', 'e1');

      expect(prisma.expense.delete).toHaveBeenCalledWith({
        where: { id: 'e1' },
      });
    });

    it('is 404 for an expense that is not mine', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(service().remove('u2', 'e1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.expense.delete).not.toHaveBeenCalled();
    });

    it('is 409 for a bill share (unlock the bill instead)', async () => {
      prisma.expense.findFirst.mockResolvedValue(
        row({ source: 'BILL_SHARE', billId: 'b1' }),
      );

      await expect(service().remove('u1', 'e1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.expense.delete).not.toHaveBeenCalled();
    });
  });

  describe('draftFromPhoto', () => {
    const photo = Buffer.from('photo');

    it('turns the receipt into a draft expense, without saving anything', async () => {
      const draft = await service().draftFromPhoto('u1', photo, 'image/png');

      expect(draft).toEqual({
        amountCents: 3537,
        amount: '$35.37',
        merchant: 'Maxwell Food Centre',
        category: 'FOOD_DRINKS',
        categoryFrom: 'ai',
        spentAt: '2026-11-01',
        source: 'RECEIPT',
      });
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it('adds up the items when no total is printed, and leaves unknowns empty', async () => {
      const reader = readerOf({
        items: [
          { name: 'Kopi', unitPriceCents: 150, quantity: 2 },
          { name: 'Toast', unitPriceCents: 220, quantity: 1 },
        ],
      });

      expect(
        await service(reader).draftFromPhoto('u1', photo, 'image/png'),
      ).toEqual({
        amountCents: 520,
        amount: '$5.20',
        merchant: null,
        category: 'OTHERS',
        categoryFrom: 'none',
        spentAt: null,
        source: 'RECEIPT',
      });
    });

    it('uses my remembered category for that merchant over the AI one', async () => {
      prisma.merchantCategory.findUnique.mockResolvedValue({
        category: 'ENTERTAINMENT',
      });
      expect(
        await service().draftFromPhoto('u1', photo, 'image/png'),
      ).toMatchObject({ category: 'ENTERTAINMENT', categoryFrom: 'memory' });
      expect(prisma.merchantCategory.findUnique).toHaveBeenCalledWith({
        where: {
          userId_merchantKey: {
            userId: 'u1',
            merchantKey: 'maxwell food centre',
          },
        },
      });
    });

    it('is 422 when the receipt shows no amount at all', async () => {
      await expect(
        service(readerOf({ items: [] })).draftFromPhoto(
          'u1',
          photo,
          'image/png',
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('guessCategory: memory, then AI, then keyword rules', () => {
    it('memory beats the AI', async () => {
      prisma.merchantCategory.findUnique.mockResolvedValue({
        category: 'FOOD_DRINKS',
      });
      expect(await service().guessCategory('u1', 'Starbucks', 'GIFTS')).toEqual(
        { category: 'FOOD_DRINKS', from: 'memory' },
      );
    });

    it('the AI beats the rules, but its OTHERS counts as no answer', async () => {
      prisma.merchantCategory.findUnique.mockResolvedValue(null);
      expect(await service().guessCategory('u1', 'Grab', 'TRAVEL')).toEqual({
        category: 'TRAVEL',
        from: 'ai',
      });
      expect(await service().guessCategory('u1', 'Grab', 'OTHERS')).toEqual({
        category: 'TRANSPORT',
        from: 'rules',
      });
    });

    it('with no usable merchant it never looks up memory', async () => {
      expect(await service().guessCategory('u1', undefined)).toEqual({
        category: 'OTHERS',
        from: 'none',
      });
      expect(await service().guessCategory('u1', '!!!')).toEqual({
        category: 'OTHERS',
        from: 'none',
      });
      expect(prisma.merchantCategory.findUnique).not.toHaveBeenCalled();
    });
  });
});
