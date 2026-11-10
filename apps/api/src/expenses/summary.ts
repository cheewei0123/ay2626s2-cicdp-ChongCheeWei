import type { Category } from '../generated/prisma/enums.js';
import { formatCents } from '../split/money.js';

// One month's spending: the total, and one line per category, biggest first.
// Pure function (no database), so the maths is easy to test.
export function summarise(
  expenses: { category: Category; amountCents: number }[],
) {
  const perCategory = new Map<
    Category,
    { totalCents: number; count: number }
  >();
  let totalCents = 0;

  for (const { category, amountCents } of expenses) {
    totalCents += amountCents;
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

  return { totalCents, total: formatCents(totalCents), byCategory };
}
