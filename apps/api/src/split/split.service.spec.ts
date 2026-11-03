import { allocate, SplitInput, SplitService } from './split.service.js';

const service = new SplitService();

// The brief's example bill
const briefBill: SplitInput = {
  items: [
    { id: 'chicken-rice', unitPriceCents: 600, quantity: 1 },
    { id: 'laksa', unitPriceCents: 750, quantity: 1 },
    { id: 'tiger', unitPriceCents: 800, quantity: 2 },
  ],
  claims: [
    { itemId: 'chicken-rice', participantId: 'chee', shares: 1 },
    { itemId: 'laksa', participantId: 'ali', shares: 1 },
    { itemId: 'tiger', participantId: 'ben', shares: 1 },
    { itemId: 'tiger', participantId: 'dan', shares: 1 },
  ],
  serviceBp: 1000,
  gstBp: 900,
  ownerParticipantId: 'chee',
};

function totals(input: SplitInput): Record<string, number> {
  const result = service.split(input);
  return Object.fromEntries(
    result.people.map((p) => [p.participantId, p.totalCents]),
  );
}

describe('allocate (largest remainder)', () => {
  it('splits 1000 three ways as 334 / 333 / 333', () => {
    const result = allocate(
      1000,
      new Map([
        ['a', 1],
        ['b', 1],
        ['c', 1],
      ]),
    );
    expect(Object.fromEntries(result)).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('gives leftover cents to the largest fractions first', () => {
    // 10 split 1:2 = 3.33 and 6.67 -> the 0.67 gets the spare cent
    const result = allocate(
      10,
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    expect(Object.fromEntries(result)).toEqual({ a: 3, b: 7 });
  });

  it('gives everyone 0 when all weights are 0', () => {
    const result = allocate(0, new Map([['a', 0]]));
    expect(result.get('a')).toBe(0);
  });
});

describe('SplitService.split', () => {
  it('matches the brief: Chee 720, Ali 899, Ben 959, Dan 959', () => {
    expect(totals(briefBill)).toEqual({
      ali: 899,
      ben: 959,
      chee: 720,
      dan: 959,
    });
  });

  it('breaks each share into items, service and GST that add up', () => {
    const chee = service
      .split(briefBill)
      .people.find((p) => p.participantId === 'chee');
    expect(chee).toEqual({
      participantId: 'chee',
      itemsCents: 600,
      serviceCents: 60,
      gstCents: 60,
      totalCents: 720,
    });
  });

  it('makes per-person totals add up exactly to the receipt total', () => {
    const sum = Object.values(totals(briefBill)).reduce((a, b) => a + b, 0);
    expect(sum).toBe(3537);
  });

  it('splits one $10 item between 3 people as 334 / 333 / 333', () => {
    const input: SplitInput = {
      items: [{ id: 'pizza', unitPriceCents: 1000, quantity: 1 }],
      claims: [
        { itemId: 'pizza', participantId: 'a', shares: 1 },
        { itemId: 'pizza', participantId: 'b', shares: 1 },
        { itemId: 'pizza', participantId: 'c', shares: 1 },
      ],
      serviceBp: 0,
      gstBp: 0,
      ownerParticipantId: 'a',
    };
    expect(totals(input)).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('splits by shares, e.g. 2:1', () => {
    const input: SplitInput = {
      items: [{ id: 'jug', unitPriceCents: 900, quantity: 1 }],
      claims: [
        { itemId: 'jug', participantId: 'a', shares: 2 },
        { itemId: 'jug', participantId: 'b', shares: 1 },
      ],
      serviceBp: 0,
      gstBp: 0,
      ownerParticipantId: 'a',
    };
    expect(totals(input)).toEqual({ a: 600, b: 300 });
  });

  it('gives unclaimed items to the owner and reports them', () => {
    const input: SplitInput = {
      ...briefBill,
      claims: briefBill.claims.filter((c) => c.itemId !== 'laksa'),
    };
    const result = service.split(input);
    expect(result.unclaimedCents).toBe(750);
    expect(totals(input)).toEqual({ ben: 959, chee: 1619, dan: 959 });
  });

  it('throws when shares are not a whole number above 0', () => {
    const input: SplitInput = {
      ...briefBill,
      claims: [{ itemId: 'laksa', participantId: 'ali', shares: 0 }],
    };
    expect(() => service.split(input)).toThrow(RangeError);
  });

  it('throws when a claim points at an item that does not exist', () => {
    const input: SplitInput = {
      ...briefBill,
      claims: [{ itemId: 'nope', participantId: 'ali', shares: 1 }],
    };
    expect(() => service.split(input)).toThrow(RangeError);
  });
});
