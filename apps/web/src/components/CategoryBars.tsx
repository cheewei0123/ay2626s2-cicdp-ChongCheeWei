import { formatCents } from '../bills/money';
import { CATEGORIES, type MonthSummary } from '../expenses/types';

// Where the month's money went: one bar per category, biggest first, with $ and %.
// Bars are plain ink on glass: colour on this page is kept for meaning (ui-design.md).
export function CategoryBars({ summary }: { summary: MonthSummary }) {
  return (
    <ul aria-label="Spending by category" className="flex flex-col gap-3">
      {summary.byCategory.map((line) => {
        const percent = Math.round(
          (line.totalCents / summary.totalCents) * 100,
        );
        const { icon, label } = CATEGORIES[line.category];
        return (
          <li key={line.category} className="flex flex-col gap-1">
            <span className="flex justify-between text-sm">
              <span>
                <span aria-hidden="true">{icon}</span> {label}
              </span>
              <span>
                <span className="font-semibold">
                  {formatCents(line.totalCents)}
                </span>{' '}
                <span className="opacity-75">{percent}%</span>
              </span>
            </span>
            <span aria-hidden="true" className="h-2 rounded-full bg-surface">
              <span
                className="block h-2 rounded-full bg-ink"
                style={{ width: `${Math.max(percent, 1)}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
