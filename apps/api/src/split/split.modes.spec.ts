import fc from 'fast-check';
import { billTotals } from './money.js';
import {
  allocate,
  checkItemSplit,
  itemPortions,
  type SplitClaim,
  type SplitInput,
  type SplitItem,
  type SplitMode,
  SplitService,
} from './split.service.js';

const service = new SplitService();
const asObject = (m: Map<string, number>) => Object.fromEntries(m);

// Tiger Beer x2 = $16.00, shared by Ben and Dan (the brief's bill)
const tiger = (splitMode: SplitMode): SplitItem => ({
  id: 'tiger',
  unitPriceCents: 800,
  quantity: 2,
  splitMode,
});
const claim = (
  participantId: string,
  extra: Partial<SplitClaim> = {},
): SplitClaim => ({
  itemId: 'tiger',
  participantId,
  shares: 1,
  ...extra,
});

describe('itemPortions: how one item is shared', () => {
  it('PERCENT: Ben 70% / Dan 30% of $16.00 → 1120 / 480', () => {
    const portions = itemPortions(tiger('PERCENT'), [
      claim('ben', { percentBp: 7000 }),
      claim('dan', { percentBp: 3000 }),
    ]);
    expect(asObject(portions)).toEqual({ ben: 1120, dan: 480 });
  });

  it('SHARES: 2:1 on $9.00 → 600 / 300', () => {
    const jug = {
      id: 'jug',
      unitPriceCents: 900,
      quantity: 1,
      splitMode: 'SHARES' as const,
    };
    const portions = itemPortions(jug, [
      { itemId: 'jug', participantId: 'a', shares: 2 },
      { itemId: 'jug', participantId: 'b', shares: 1 },
    ]);
    expect(asObject(portions)).toEqual({ a: 600, b: 300 });
  });

  it('EQUAL ignores shares: $10.00 for 3 → 334 / 333 / 333', () => {
    const pizza = {
      id: 'pizza',
      unitPriceCents: 1000,
      quantity: 1,
      splitMode: 'EQUAL' as const,
    };
    const portions = itemPortions(pizza, [
      { itemId: 'pizza', participantId: 'a', shares: 5 },
      { itemId: 'pizza', participantId: 'b', shares: 1 },
      { itemId: 'pizza', participantId: 'c', shares: 1 },
    ]);
    expect(asObject(portions)).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('EXACT: everyone pays the amount they typed', () => {
    const portions = itemPortions(tiger('EXACT'), [
      claim('ben', { exactCents: 1000 }),
      claim('dan', { exactCents: 600 }),
    ]);
    expect(asObject(portions)).toEqual({ ben: 1000, dan: 600 });
  });
});

describe('checkItemSplit: rules for each mode', () => {
  it.each([
    [
      'percentages that add up to 90%',
      'PERCENT',
      [claim('ben', { percentBp: 6000 }), claim('dan', { percentBp: 3000 })],
      'Percentages add up to 90%, need 100%',
    ],
    [
      'percentages that add up to 33.33%',
      'PERCENT',
      [claim('ben', { percentBp: 3333 })],
      'Percentages add up to 33.33%, need 100%',
    ],
    [
      'exact amounts that are $1 short',
      'EXACT',
      [claim('ben', { exactCents: 1000 }), claim('dan', { exactCents: 500 })],
      'Exact amounts add up to $15.00, need $16.00',
    ],
    [
      'a missing percentage',
      'PERCENT',
      [claim('ben', { percentBp: 10000 }), claim('dan')],
      'Every person on a PERCENT item needs a percentBp',
    ],
    [
      'a missing exact amount',
      'EXACT',
      [claim('ben', { exactCents: 1600 }), claim('dan')],
      'Every person on an EXACT item needs an exactCents',
    ],
    [
      'a negative percentage',
      'PERCENT',
      [claim('ben', { percentBp: 11000 }), claim('dan', { percentBp: -1000 })],
      'percentBp must be a whole number >= 0, got -1000',
    ],
    [
      'zero shares',
      'SHARES',
      [claim('ben', { shares: 0 }), claim('dan')],
      'shares must be a whole number >= 1',
    ],
  ] as const)('rejects %s', (_case, mode, claims, message) => {
    expect(() => checkItemSplit(tiger(mode), [...claims])).toThrow(message);
  });

  // Regression: found by the property test below
  it.each(['PERCENT', 'EXACT'] as const)(
    'accepts an unclaimed %s item (the owner pays it)',
    (mode) => {
      expect(() => checkItemSplit(tiger(mode), [])).not.toThrow();
    },
  );

  it.each(['EQUAL', 'SHARES', 'PERCENT', 'EXACT'] as const)(
    'accepts a valid %s split',
    (mode) => {
      const claims = [
        claim('ben', { percentBp: 7000, exactCents: 1000 }),
        claim('dan', { percentBp: 3000, exactCents: 600 }),
      ];
      expect(() => checkItemSplit(tiger(mode), claims)).not.toThrow();
    },
  );
});

describe('split with modes: the whole bill', () => {
  // The brief's bill, but Ben had more of the Tiger: 70% / 30%
  const input: SplitInput = {
    items: [
      { id: 'chicken-rice', unitPriceCents: 600, quantity: 1 },
      { id: 'laksa', unitPriceCents: 750, quantity: 1 },
      tiger('PERCENT'),
    ],
    claims: [
      { itemId: 'chicken-rice', participantId: 'chee', shares: 1 },
      { itemId: 'laksa', participantId: 'ali', shares: 1 },
      claim('ben', { percentBp: 7000 }),
      claim('dan', { percentBp: 3000 }),
    ],
    serviceBp: 1000,
    gstBp: 900,
    ownerParticipantId: 'chee',
  };

  it('still totals 3537, with Ben 1120 and Dan 480 of items', () => {
    const people = service.split(input).people;
    const items = Object.fromEntries(
      people.map((p) => [p.participantId, p.itemsCents]),
    );
    expect(items).toEqual({ ali: 750, ben: 1120, chee: 600, dan: 480 });
    expect(people.reduce((a, p) => a + p.totalCents, 0)).toBe(3537);
  });

  it('refuses a bill with an invalid split', () => {
    const bad = {
      ...input,
      claims: [
        ...input.claims.slice(0, 2),
        claim('ben', { percentBp: 6000 }),
        claim('dan', { percentBp: 3000 }),
      ],
    };
    expect(() => service.split(bad)).toThrow(
      'Percentages add up to 90%, need 100%',
    );
  });
});

// Property test (KAN-21) extended: random bills where every item gets a random mode
const modeBillArb = fc
  .record({
    people: fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd', 'e'), {
      minLength: 1,
      maxLength: 5,
    }),
    items: fc.array(
      fc.record({
        unitPriceCents: fc.integer({ min: 1, max: 50000 }),
        quantity: fc.integer({ min: 1, max: 4 }),
        splitMode: fc.constantFrom<SplitMode>(
          'EQUAL',
          'SHARES',
          'PERCENT',
          'EXACT',
        ),
      }),
      { maxLength: 8 },
    ),
    serviceBp: fc.constantFrom(0, 1000),
    gstBp: fc.constantFrom(0, 900),
    seed: fc.array(fc.integer({ min: 0, max: 3 }), {
      minLength: 40,
      maxLength: 40,
    }),
  })
  .map(({ people, items, serviceBp, gstBp, seed }): SplitInput => {
    const named = items.map((item, i) => ({ id: `item${i}`, ...item }));
    const claims = named.flatMap((item, i) => {
      // seed decides who claimed the item and their weight (0 = not claimed)
      const weights = new Map(
        people
          .map(
            (p, j) => [p, seed[(i * people.length + j) % seed.length]] as const,
          )
          .filter(([, w]) => w > 0),
      );
      if (weights.size === 0) return [];
      // Valid PERCENT and EXACT values: split 10000 or the price by the same weights
      const percents = allocate(10000, weights);
      const exacts = allocate(item.unitPriceCents * item.quantity, weights);
      return [...weights].map(([participantId, w]) => ({
        itemId: item.id,
        participantId,
        shares: w,
        percentBp: percents.get(participantId)!,
        exactCents: exacts.get(participantId)!,
      }));
    });
    return {
      items: named,
      claims,
      serviceBp,
      gstBp,
      ownerParticipantId: people[0],
    };
  });

describe('split properties with random modes (1,000 random bills)', () => {
  it('per-person totals always add up to the receipt total', () => {
    fc.assert(
      fc.property(modeBillArb, (input) => {
        const subtotal = input.items.reduce(
          (a, i) => a + i.unitPriceCents * i.quantity,
          0,
        );
        const total = service
          .split(input)
          .people.reduce((a, p) => a + p.totalCents, 0);
        expect(total).toBe(
          billTotals(subtotal, input.serviceBp, input.gstBp).total,
        );
      }),
      { numRuns: 1000 },
    );
  });

  it('nobody is ever charged a negative amount', () => {
    fc.assert(
      fc.property(modeBillArb, (input) => {
        for (const p of service.split(input).people) {
          expect(
            Math.min(p.itemsCents, p.serviceCents, p.gstCents),
          ).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
