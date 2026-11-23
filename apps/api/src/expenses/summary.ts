import type { Category } from '../generated/prisma/enums.js';
import { formatCents } from '../split/money.js';
import { singaporeDate } from './month.js';

// One period's spending: the total, one line per category (biggest first) and
// one per Singapore day that has spending (oldest first, for the chart, KAN-94).
// Pure function (no database), so the maths is easy to test.
export function summarise(
  expenses: { category: Category; amountCents: number; spentAt: Date }[],
) {
  const perCategory = new Map<
    Category,
    { totalCents: number; count: number }
  >();
  const perDay = new Map<string, number>();
  let totalCents = 0;

  for (const { category, amountCents, spentAt } of expenses) {
    totalCents += amountCents;
    const day = singaporeDate(spentAt);
    perDay.set(day, (perDay.get(day) ?? 0) + amountCents);
    const line = perCategory.get(category) ?? { totalCents: 0, count: 0 };
    line.totalCents += amountCents;
    line.count += 1;
    perCategory.set(category, line);
  }

  const byCategory = [...perCategory]
    .map(([category, line]) => ({
      category,
      totalCents: line.totalCents,
      total: formatCents(line.totalCents),
      count: line.count,
    }))
    // Biggest first; a tie is ordered by name so the result is always the same
    .sort(
      (a, b) =>
        b.totalCents - a.totalCents || a.category.localeCompare(b.category),
    );

  const byDay = [...perDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cents]) => ({ day, totalCents: cents }));

  return { totalCents, total: formatCents(totalCents), byCategory, byDay };
}
