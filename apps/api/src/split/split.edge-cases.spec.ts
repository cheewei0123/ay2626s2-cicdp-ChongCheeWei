import fc from 'fast-check';
import { billTotals } from './money.js';
import { allocate, SplitInput, SplitService } from './split.service.js';

const service = new SplitService();

function sumTotals(input: SplitInput): number {
  return service.split(input).people.reduce((a, p) => a + p.totalCents, 0);
}

function totalsById(input: SplitInput): Record<string, number> {
  return Object.fromEntries(
    service.split(input).people.map((p) => [p.participantId, p.totalCents]),
  );
}

const twelvePeople = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);

describe('split edge cases', () => {
  it.each<{
    name: string;
    input: SplitInput;
    expected: Record<string, number>;
  }>([
    {
      name: 'unclaimed item goes to the owner',
      input: {
        items: [
          { id: 'rice', unitPriceCents: 500, quantity: 1 },
          { id: 'drink', unitPriceCents: 200, quantity: 1 },
        ],
        claims: [{ itemId: 'rice', participantId: 'guest', shares: 1 }],
        serviceBp: 0,
        gstBp: 0,
        ownerParticipantId: 'owner',
      },
      expected: { guest: 500, owner: 200 },
    },
    {
      name: '$10 shared by 3',
      input: {
        items: [{ id: 'pizza', unitPriceCents: 1000, quantity: 1 }],
        claims: ['a', 'b', 'c'].map((p) => ({
          itemId: 'pizza',
          participantId: p,
          shares: 1,
        })),
        serviceBp: 0,
        gstBp: 0,
        ownerParticipantId: 'a',
      },
      expected: { a: 334, b: 333, c: 333 },
    },
    {
      name: 'hawker bill: GST only',
      input: {
        items: [{ id: 'noodles', unitPriceCents: 1000, quantity: 1 }],
        claims: [{ itemId: 'noodles', participantId: 'a', shares: 1 }],
        serviceBp: 0,
        gstBp: 900,
        ownerParticipantId: 'a',
      },
      expected: { a: 1090 },
    },
    {
      name: 'no charges: total = subtotal',
      input: {
        items: [{ id: 'kopi', unitPriceCents: 180, quantity: 3 }],
        claims: [{ itemId: 'kopi', participantId: 'a', shares: 1 }],
        serviceBp: 0,
        gstBp: 0,
        ownerParticipantId: 'a',
      },
      expected: { a: 540 },
    },
    {
      name: 'single person gets the full total',
      input: {
        items: [
          { id: 'a1', unitPriceCents: 600, quantity: 1 },
          { id: 'a2', unitPriceCents: 750, quantity: 1 },
          { id: 'a3', unitPriceCents: 800, quantity: 2 },
        ],
        claims: ['a1', 'a2', 'a3'].map((id) => ({
          itemId: id,
          participantId: 'solo',
          shares: 1,
        })),
        serviceBp: 1000,
        gstBp: 900,
        ownerParticipantId: 'solo',
      },
      expected: { solo: 3537 },
    },
    {
      name: 'uneven shares 2:1',
      input: {
        items: [{ id: 'jug', unitPriceCents: 900, quantity: 1 }],
        claims: [
          { itemId: 'jug', participantId: 'a', shares: 2 },
          { itemId: 'jug', participantId: 'b', shares: 1 },
        ],
        serviceBp: 0,
        gstBp: 0,
        ownerParticipantId: 'a',
      },
      expected: { a: 600, b: 300 },
    },
    {
      name: 'empty bill: all zeros, no crash',
      input: {
        items: [],
        claims: [],
        serviceBp: 1000,
        gstBp: 900,
        ownerParticipantId: 'owner',
      },
      expected: { owner: 0 },
    },
  ])('$name', ({ input, expected }) => {
    expect(totalsById(input)).toEqual(expected);
  });

  it('large bill ($2,345.67, 12 people) adds up to the receipt total', () => {
    const input: SplitInput = {
      items: [{ id: 'banquet', unitPriceCents: 234567, quantity: 1 }],
      claims: twelvePeople.map((p) => ({
        itemId: 'banquet',
        participantId: p,
        shares: 1,
      })),
      serviceBp: 1000,
      gstBp: 900,
      ownerParticipantId: 'p1',
    };
    const people = service.split(input).people;

    expect(sumTotals(input)).toBe(billTotals(234567, 1000, 900).total);
    // Fair to the cent: nobody pays more than 1 cent per part above anyone else
    const totals = people.map((p) => p.totalCents);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(3);
  });

  // Regression: found by the property test. Many different share totals make
  // the LCM scale large enough to overflow normal JavaScript numbers.
  it('splits a big bill where every item has a different share total', () => {
    const shareTotals = [7, 8, 9, 10, 11, 13];
    const input: SplitInput = {
      items: shareTotals.map((_, i) => ({
        id: `dish${i}`,
        unitPriceCents: 250000,
        quantity: 1,
      })),
      claims: shareTotals.flatMap((total, i) => [
        { itemId: `dish${i}`, participantId: 'a', shares: 1 },
        { itemId: `dish${i}`, participantId: 'b', shares: total - 1 },
      ]),
      serviceBp: 1000,
      gstBp: 900,
      ownerParticipantId: 'a',
    };
    expect(sumTotals(input)).toBe(billTotals(1500000, 1000, 900).total);
  });
});

describe('allocate safety checks', () => {
  it('throws when there is money to split but every weight is 0', () => {
    expect(() => allocate(100, new Map([['a', 0]]))).toThrow(RangeError);
  });

  it('splits amounts near the largest safe number exactly', () => {
    const result = allocate(
      Number.MAX_SAFE_INTEGER,
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    expect(result.get('a')! + result.get('b')!).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('throws on a decimal weight', () => {
    expect(() => allocate(100, new Map([['a', 1.5]]))).toThrow(RangeError);
  });
});

// Property test: fast-check generates random bills and tries to break the rules
const billArb = fc
  .record({
    people: fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), {
      minLength: 1,
      maxLength: 6,
    }),
    items: fc.array(
      fc.record({
        unitPriceCents: fc.integer({ min: 0, max: 50000 }),
        quantity: fc.integer({ min: 1, max: 5 }),
      }),
      { maxLength: 10 },
    ),
    serviceBp: fc.constantFrom(0, 1000),
    gstBp: fc.constantFrom(0, 900),
    seed: fc.array(fc.integer({ min: 0, max: 3 }), {
      minLength: 60,
      maxLength: 60,
    }),
  })
  .map(({ people, items, serviceBp, gstBp, seed }): SplitInput => {
    // seed decides who claims each item and with how many shares (0 = not claimed)
    const namedItems = items.map((item, i) => ({ id: `item${i}`, ...item }));
    const claims = namedItems.flatMap((item, i) =>
      people.flatMap((participantId, j) => {
        const shares = seed[(i * people.length + j) % seed.length];
        return shares > 0 ? [{ itemId: item.id, participantId, shares }] : [];
      }),
    );
    return {
      items: namedItems,
      claims,
      serviceBp,
      gstBp,
      ownerParticipantId: people[0],
    };
  });

describe('split properties (1,000 random bills)', () => {
  it('per-person totals always add up to the receipt total', () => {
    fc.assert(
      fc.property(billArb, (input) => {
        const subtotal = input.items.reduce(
          (a, i) => a + i.unitPriceCents * i.quantity,
          0,
        );
        const receipt = billTotals(subtotal, input.serviceBp, input.gstBp);
        expect(sumTotals(input)).toBe(receipt.total);
      }),
      { numRuns: 1000 },
    );
  });

  it('nobody is ever charged a negative amount', () => {
    fc.assert(
      fc.property(billArb, (input) => {
        for (const p of service.split(input).people) {
          expect(p.itemsCents).toBeGreaterThanOrEqual(0);
          expect(p.serviceCents).toBeGreaterThanOrEqual(0);
          expect(p.gstCents).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
