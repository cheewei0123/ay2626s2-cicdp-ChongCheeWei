import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OwnedBill } from '../bills/guards/bill-owner.guard.js';
import { SummaryService } from '../bills/summary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

const locked: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'LOCKED' };
const person = (
  participantId: string,
  totalCents: number,
  more: object = {},
) => ({ participantId, totalCents, isOwner: false, paid: false, ...more });

// The brief's bill: Chee (owner) 720, Ali 899, Ben 959. Ali has already paid.
const people = [
  person('p-chee', 720, { isOwner: true }),
  person('p-ali', 899, { paid: true }),
  person('p-ben', 959),
];

describe('PaymentsService (mocked database and summary)', () => {
  let service: PaymentsService;
  const prisma = { payment: { upsert: vi.fn() }, bill: { update: vi.fn() } };
  const summary = { forBill: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    summary.forBill.mockResolvedValue({ people });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SummaryService, useValue: summary },
      ],
    }).compile();
    service = moduleRef.get(PaymentsService);
  });

  it('records a payment with a snapshot of the amount and the time', async () => {
    prisma.bill.update.mockResolvedValue({});
    const result = await service.markPaid(locked, 'p-ben', true);

    const upsert = prisma.payment.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ participantId: 'p-ben' });
    expect(upsert.create).toMatchObject({
      billId: 'b1',
      participantId: 'p-ben',
      amountCents: 959,
    });
    expect(upsert.create.paidAt).toBeInstanceOf(Date);
    expect(upsert.update.amountCents).toBe(959);
    expect(result).toEqual({
      participantId: 'p-ben',
      paid: true,
      amountCents: 959,
      paidCount: 2,
      owingCount: 2,
      status: 'SETTLED',
    });
  });

  it('settles the bill when the last person who owes something pays', async () => {
    await service.markPaid(locked, 'p-ben', true);
    expect(prisma.bill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'SETTLED' },
    });
  });

  it('stays LOCKED while someone still owes', async () => {
    summary.forBill.mockResolvedValue({
      people: [...people, person('p-dan', 959)],
    });
    const result = await service.markPaid(locked, 'p-ben', true);
    expect(result).toMatchObject({
      paidCount: 2,
      owingCount: 3,
      status: 'LOCKED',
    });
    expect(prisma.bill.update).not.toHaveBeenCalled();
  });

  it('unticking someone clears paidAt and reopens a SETTLED bill to LOCKED', async () => {
    const settled: OwnedBill = { ...locked, status: 'SETTLED' };
    const result = await service.markPaid(settled, 'p-ali', false);

    expect(prisma.payment.upsert.mock.calls[0][0].update.paidAt).toBeNull();
    expect(result).toMatchObject({ paid: false, status: 'LOCKED' });
    expect(prisma.bill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'LOCKED' },
    });
  });

  it('answers 409 while the bill is still OPEN', async () => {
    await expect(
      service.markPaid({ ...locked, status: 'OPEN' }, 'p-ben', true),
    ).rejects.toThrow(ConflictException);
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
  });

  it('answers 404 for someone who is not on the bill', async () => {
    await expect(service.markPaid(locked, 'p-nobody', true)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('answers 400 for the owner', async () => {
    await expect(service.markPaid(locked, 'p-chee', true)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('never settles a bill where nobody owes anything', async () => {
    summary.forBill.mockResolvedValue({
      people: [people[0], person('p-ali', 0)],
    });
    const result = await service.markPaid(locked, 'p-ali', true);
    expect(result).toMatchObject({ owingCount: 0, status: 'LOCKED' });
  });
});

describe('PaymentsController', () => {
  it('passes the bill, the person and paid to the service', async () => {
    const payments = { markPaid: vi.fn().mockResolvedValue('ok') };
    const controller = new PaymentsController(
      payments as unknown as PaymentsService,
    );
    expect(await controller.markPaid(locked, 'p-ben', { paid: true })).toBe(
      'ok',
    );
    expect(payments.markPaid).toHaveBeenCalledWith(locked, 'p-ben', true);
  });
});
