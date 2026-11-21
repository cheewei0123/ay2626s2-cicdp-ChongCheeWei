import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { SplitModule } from '../split/split.module.js';
import { SummaryService } from './summary.service.js';

// The brief's bill as the database would return it. Chee (the owner) is p-chee.
const participants = [
  { id: 'p-chee', displayName: 'Chee', userId: 'u1', payment: null },
  {
    id: 'p-ali',
    displayName: 'Ali',
    userId: null,
    payment: { paidAt: new Date() },
  },
  { id: 'p-ben', displayName: 'Ben', userId: null, payment: null },
  { id: 'p-dan', displayName: 'Dan', userId: null, payment: { paidAt: null } },
];
const claim = (participantId: string) => ({
  participantId,
  shares: 1,
  percentBp: null,
  exactCents: null,
});
const briefBill = {
  ownerId: 'u1',
  serviceBp: 1000,
  gstBp: 900,
  owner: { displayName: 'Chee', paynowMobile: '+6591234567' },
  items: [
    {
      id: 'chicken-rice',
      unitPriceCents: 600,
      quantity: 1,
      splitMode: 'EQUAL',
      claims: [claim('p-chee')],
    },
    {
      id: 'laksa',
      unitPriceCents: 750,
      quantity: 1,
      splitMode: 'EQUAL',
      claims: [claim('p-ali')],
    },
    {
      id: 'tiger',
      unitPriceCents: 800,
      quantity: 2,
      splitMode: 'EQUAL',
      claims: [claim('p-ben'), claim('p-dan')],
    },
  ],
  participants,
};

describe('SummaryService (mocked database, real SplitService)', () => {
  let service: SummaryService;
  const prisma = {
    bill: { findUnique: vi.fn() },
    participant: { create: vi.fn() },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    // DI: the real SplitService comes from SplitModule; only the database is fake
    const moduleRef = await Test.createTestingModule({
      imports: [SplitModule],
      providers: [SummaryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SummaryService);
  });

  it("gives the brief's answer: Chee 720, Ali 899, Ben 959, Dan 959 = 3537", async () => {
    prisma.bill.findUnique.mockResolvedValue(briefBill);

    const summary = await service.forBill('b1');

    expect(summary.people.map((p) => [p.displayName, p.totalCents])).toEqual([
      ['Chee', 720],
      ['Ali', 899],
      ['Ben', 959],
      ['Dan', 959],
    ]);
    expect(summary).toMatchObject({
      subtotalCents: 2950,
      serviceCents: 295,
      gstCents: 292,
      totalCents: 3537,
      total: '$35.37',
      unclaimedCents: 0,
    });
    expect(summary.people[0]).toMatchObject({
      participantId: 'p-chee',
      isOwner: true,
      itemsCents: 600,
      total: '$7.20',
    });
  });

  it('per-person totals add up to the bill total', async () => {
    prisma.bill.findUnique.mockResolvedValue(briefBill);
    const summary = await service.forBill('b1');
    expect(summary.people.reduce((a, p) => a + p.totalCents, 0)).toBe(
      summary.totalCents,
    );
  });

  it('always lists the owner first, even if they became a participant last', async () => {
    prisma.bill.findUnique.mockResolvedValue({
      ...briefBill,
      participants: [...participants.slice(1), participants[0]],
    });
    const names = (await service.forBill('b1')).people.map(
      (p) => p.displayName,
    );
    expect(names).toEqual(['Chee', 'Ali', 'Ben', 'Dan']);
  });

  it('marks who has paid', async () => {
    prisma.bill.findUnique.mockResolvedValue(briefBill);
    const paid = (await service.forBill('b1')).people.map((p) => p.paid);
    expect(paid).toEqual([false, true, false, false]);
  });

  it('puts unclaimed items on the owner and reports them', async () => {
    const laksaUnclaimed = {
      ...briefBill,
      items: briefBill.items.map((i) =>
        i.id === 'laksa' ? { ...i, claims: [] } : i,
      ),
    };
    prisma.bill.findUnique.mockResolvedValue(laksaUnclaimed);

    const summary = await service.forBill('b1');

    expect(summary.unclaimedCents).toBe(750);
    const chee = summary.people.find((p) => p.displayName === 'Chee')!;
    expect(chee.itemsCents).toBe(600 + 750);
    expect(
      summary.people.find((p) => p.displayName === 'Ali')!.totalCents,
    ).toBe(0);
    expect(summary.people.reduce((a, p) => a + p.totalCents, 0)).toBe(3537);
  });

  it("adds the owner's PayNow details only to the guest view", async () => {
    prisma.bill.findUnique.mockResolvedValue(briefBill);
    expect(await service.forBill('b1')).not.toHaveProperty('paynow');
    expect(await service.forGuest('b1')).toMatchObject({
      paynow: { mobile: '+6591234567', name: 'Chee' },
    });
  });

  it('gives each guest who owes something a PayNow QR for their exact amount', async () => {
    prisma.bill.findUnique.mockResolvedValue({
      ...briefBill,
      joinCode: 'K7P2Q',
    });

    const { people } = await service.forGuest('b1');
    const payload = (name: string) =>
      people.find((p) => p.displayName === name)!.paynowPayload;

    // Ali owes 899: tag 54 is the amount, tag 62 the reference
    expect(payload('Ali')).toContain('54048.99');
    expect(payload('Ali')).toContain('0114SplitLah K7P2Q');
    expect(payload('Ali')).toContain('+6591234567');
    expect(payload('Ben')).toContain('54049.59');
    // The owner doesn't pay themselves
    expect(payload('Chee')).toBeNull();
  });

  it('gives no QR when the owner has no PayNow number or the guest owes nothing', async () => {
    prisma.bill.findUnique.mockResolvedValue({
      ...briefBill,
      owner: { displayName: 'Chee', paynowMobile: null },
    });
    const noNumber = await service.forGuest('b1');
    expect(noNumber.people.every((p) => p.paynowPayload === null)).toBe(true);

    prisma.bill.findUnique.mockResolvedValue({
      ...briefBill,
      items: [briefBill.items[0]], // only Chee's chicken rice
    });
    const owesNothing = await service.forGuest('b1');
    expect(
      owesNothing.people.find((p) => p.displayName === 'Ali')!.paynowPayload,
    ).toBeNull();
  });

  it('creates the owner as a participant if they are not one yet', async () => {
    prisma.bill.findUnique.mockResolvedValue({
      ...briefBill,
      participants: participants.slice(1),
      items: [briefBill.items[1]],
    });
    prisma.participant.create.mockResolvedValue({ id: 'p-new-owner' });

    const summary = await service.forBill('b1');

    expect(prisma.participant.create.mock.calls[0][0].data).toEqual({
      billId: 'b1',
      displayName: 'Chee',
      userId: 'u1',
    });
    expect(summary.people[0]).toMatchObject({
      participantId: 'p-new-owner',
      displayName: 'Chee',
      isOwner: true,
      totalCents: 0,
    });
  });

  it('answers 404 if the bill is gone', async () => {
    prisma.bill.findUnique.mockResolvedValue(null);
    await expect(service.forBill('b1')).rejects.toThrow(NotFoundException);
  });
});
