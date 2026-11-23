import fc from 'fast-check';
import { Category } from '../generated/prisma/enums.js';
import { summarise } from './summary.js';

const at = new Date('2026-11-05T12:00:00+08:00');

describe('summarise (monthly total by category)', () => {
  it('returns zero for a month with no expenses', () => {
    expect(summarise([])).toEqual({
      totalCents: 0,
      total: '$0.00',
      byCategory: [],
      byDay: [],
    });
  });

  it('groups by category, counts, and lists the biggest category first', () => {
    const result = summarise([
      { category: 'FOOD_DRINKS', amountCents: 720, spentAt: at },
      { category: 'TRANSPORT', amountCents: 300, spentAt: at },
      { category: 'GROCERIES', amountCents: 3770, spentAt: at },
      { category: 'FOOD_DRINKS', amountCents: 1250, spentAt: at },
    ]);

    expect(result).toEqual({
      totalCents: 6040,
      total: '$60.40',
      byCategory: [
        { category: 'GROCERIES', totalCents: 3770, total: '$37.70', count: 1 },
        {
          category: 'FOOD_DRINKS',
          totalCents: 1970,
          total: '$19.70',
          count: 2,
        },
        { category: 'TRANSPORT', totalCents: 300, total: '$3.00', count: 1 },
      ],
      byDay: [{ day: '2026-11-05', totalCents: 6040 }],
    });
  });

  it('adds up each Singapore day, oldest first (11pm SGT stays on its own day)', () => {
    const result = summarise([
      {
        category: 'OTHERS',
        amountCents: 100,
        spentAt: new Date('2026-11-06T09:00:00+08:00'),
      },
      {
        category: 'OTHERS',
        amountCents: 200,
        spentAt: new Date('2026-11-05T23:30:00+08:00'),
      },
      {
        category: 'OTHERS',
        amountCents: 50,
        spentAt: new Date('2026-11-06T00:10:00+08:00'),
      },
    ]);
    expect(result.byDay).toEqual([
      { day: '2026-11-05', totalCents: 200 },
      { day: '2026-11-06', totalCents: 150 },
    ]);
  });

  it('breaks a tie by category name, so the order never changes between calls', () => {
    const result = summarise([
      { category: 'TRANSPORT', amountCents: 500, spentAt: at },
      { category: 'GIFTS', amountCents: 500, spentAt: at },
    ]);
    expect(result.byCategory.map((c) => c.category)).toEqual([
      'GIFTS',
      'TRANSPORT',
    ]);
  });

  it('always adds up: category totals = month total, counts = number of expenses', () => {
    const expense = fc.record({
      category: fc.constantFrom(...Object.values(Category)),
      amountCents: fc.integer({ min: 1, max: 100_000_000 }),
      spentAt: fc.date({
        min: new Date('2026-01-01'),
        max: new Date('2027-01-01'),
        noInvalidDate: true,
      }),
    });
    fc.assert(
      fc.property(fc.array(expense, { maxLength: 200 }), (expenses) => {
        const { totalCents, byCategory, byDay } = summarise(expenses);
        const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
        expect(sum(byCategory.map((c) => c.totalCents))).toBe(totalCents);
        expect(sum(expenses.map((e) => e.amountCents))).toBe(totalCents);
        expect(sum(byCategory.map((c) => c.count))).toBe(expenses.length);
        expect(sum(byDay.map((d) => d.totalCents))).toBe(totalCents);
      }),
    );
  });
});
