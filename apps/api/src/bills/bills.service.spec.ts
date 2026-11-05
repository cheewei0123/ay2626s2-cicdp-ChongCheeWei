import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillsService } from './bills.service.js';

// The brief's bill: Chicken Rice 600, Laksa 750, Tiger 800 x 2
const items = [
  { id: 'i1', name: 'Chicken Rice', unitPriceCents: 600, quantity: 1 },
  { id: 'i2', name: 'Laksa', unitPriceCents: 750, quantity: 1 },
  { id: 'i3', name: 'Tiger', unitPriceCents: 800, quantity: 2 },
];
const bill = {
  id: 'b1',
  ownerId: 'u1',
  title: 'Dinner',
  serviceBp: 1000,
  gstBp: 900,
  status: 'OPEN',
  items,
};

describe('BillsService (with a mocked database)', () => {
  let service: BillsService;
  // A fake PrismaService with only the methods BillsService uses
  const prisma = {
    bill: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    item: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [BillsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(BillsService);
  });

  describe('create', () => {
    it('saves the bill for the owner with a random share token', async () => {
      prisma.bill.create.mockResolvedValue({ ...bill, items: [] });

      await service.create('u1', { title: 'Dinner' });
      await service.create('u1', { title: 'Lunch' });

      const first = prisma.bill.create.mock.calls[0][0].data;
      const second = prisma.bill.create.mock.calls[1][0].data;
      expect(first).toMatchObject({
        ownerId: 'u1',
        title: 'Dinner',
        merchant: '',
      });
      expect(first.shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(first.shareToken).not.toBe(second.shareToken);
      expect(first.date).toBeInstanceOf(Date);
    });

    it('uses the merchant, date and rates when given', async () => {
      prisma.bill.create.mockResolvedValue({ ...bill, items: [] });
      await service.create('u1', {
        title: 'Hawker',
        merchant: 'Maxwell',
        date: '2026-11-05',
        serviceBp: 0,
        gstBp: 900,
      });
      expect(prisma.bill.create.mock.calls[0][0].data).toMatchObject({
        merchant: 'Maxwell',
        date: new Date('2026-11-05'),
        serviceBp: 0,
        gstBp: 900,
      });
    });
  });

  describe('totals', () => {
    it('adds the brief totals in cents and as text', async () => {
      prisma.bill.findFirst.mockResolvedValue(bill);
      const result = await service.getMine('u1', 'b1');
      expect(result.totals).toEqual({
        subtotalCents: 2950,
        serviceCents: 295,
        gstCents: 292,
        totalCents: 3537,
        total: '$35.37',
      });
    });

    it('gives every bill in my list its totals', async () => {
      prisma.bill.findMany.mockResolvedValue([
        bill,
        { ...bill, id: 'b2', items: [] },
      ]);
      const result = await service.listMine('u1');
      expect(result.map((b) => b.totals.totalCents)).toEqual([3537, 0]);
      expect(prisma.bill.findMany.mock.calls[0][0].where).toEqual({
        ownerId: 'u1',
      });
    });
  });

  it('answers 404 for a bill that is not mine (or does not exist)', async () => {
    prisma.bill.findFirst.mockResolvedValue(null);
    await expect(service.getMine('u2', 'b1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.bill.findFirst.mock.calls[0][0].where).toEqual({
      id: 'b1',
      ownerId: 'u2',
    });
  });

  describe('changes while the bill is OPEN', () => {
    beforeEach(() =>
      prisma.bill.findFirst.mockResolvedValueOnce({ status: 'OPEN' }),
    );

    it('updates the bill', async () => {
      prisma.bill.update.mockResolvedValue(bill);
      await service.update('u1', 'b1', {
        title: 'New title',
        date: '2026-11-06',
      });
      expect(prisma.bill.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'b1' },
        data: { title: 'New title', date: new Date('2026-11-06') },
      });
    });

    it('adds an item to the bill', async () => {
      prisma.item.create.mockResolvedValue(items[0]);
      await service.addItem('u1', 'b1', {
        name: 'Chicken Rice',
        unitPriceCents: 600,
        quantity: 1,
      });
      expect(prisma.item.create.mock.calls[0][0].data).toEqual({
        billId: 'b1',
        name: 'Chicken Rice',
        unitPriceCents: 600,
        quantity: 1,
      });
    });

    it('only edits an item that belongs to this bill', async () => {
      prisma.item.update.mockResolvedValue(items[0]);
      await service.updateItem('u1', 'b1', 'i1', { unitPriceCents: 650 });
      expect(prisma.item.update.mock.calls[0][0]).toEqual({
        where: { id: 'i1', billId: 'b1' },
        data: { unitPriceCents: 650 },
      });
    });

    it('only deletes an item that belongs to this bill', async () => {
      prisma.item.delete.mockResolvedValue(items[0]);
      await service.deleteItem('u1', 'b1', 'i1');
      expect(prisma.item.delete.mock.calls[0][0]).toEqual({
        where: { id: 'i1', billId: 'b1' },
      });
    });
  });

  it.each(['LOCKED', 'SETTLED'])(
    'answers 409 when the bill is %s',
    async (status) => {
      prisma.bill.findFirst.mockResolvedValue({ status });
      await expect(
        service.addItem('u1', 'b1', {
          name: 'x',
          unitPriceCents: 1,
          quantity: 1,
        }),
      ).rejects.toThrow(ConflictException);
      await expect(service.update('u1', 'b1', { title: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.item.create).not.toHaveBeenCalled();
      expect(prisma.bill.update).not.toHaveBeenCalled();
    },
  );

  it('answers 404 before changing a bill that is not mine', async () => {
    prisma.bill.findFirst.mockResolvedValue(null);
    await expect(service.deleteItem('u2', 'b1', 'i1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.item.delete).not.toHaveBeenCalled();
  });
});
