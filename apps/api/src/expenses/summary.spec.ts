import fc from 'fast-check';
import { Category } from '../generated/prisma/enums.js';
import { summarise } from './summary.js';

describe('summarise (monthly total by category)', () => {
  it('returns zero for a month with no expenses', () => {
    expect(summarise([])).toEqual({
      totalCents: 0,
      total: '$0.00',
      byCategory: [],
    });
  });

  it('groups by category, counts, and lists the biggest category first', () => {
    const result = summarise([
      { category: 'FOOD_DRINKS', amountCents: 720 },
      { category: 'TRANSPORT', amountCents: 300 },
      { category: 'GROCERIES', amountCents: 3770 },
      { category: 'FOOD_DRINKS', amountCents: 1250 },
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
    });
  });

  it('breaks a tie by category name, so the order never changes between calls', () => {
    const result = summarise([
      { category: 'TRANSPORT', amountCents: 500 },
      { category: 'GIFTS', amountCents: 500 },
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
    });
    fc.assert(
      fc.property(fc.array(expense, { maxLength: 200 }), (expenses) => {
        const { totalCents, byCategory } = summarise(expenses);
        const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
        expect(sum(byCategory.map((c) => c.totalCents))).toBe(totalCents);
        expect(sum(expenses.map((e) => e.amountCents))).toBe(totalCents);
        expect(sum(byCategory.map((c) => c.count))).toBe(expenses.length);
      }),
    );
  });
});
