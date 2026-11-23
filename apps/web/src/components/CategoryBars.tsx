import { formatCents } from '../bills/money';
import { CATEGORIES, type MonthSummary } from '../expenses/types';

// Where the money went: one bar per category, biggest first, with $ and %.
// One series, so one colour: chart-3 from the chart ramp (ui-design.md, Charts).
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
                <span className="text-muted">{percent}%</span>
              </span>
            </span>
            <span aria-hidden="true" className="h-2 rounded-full bg-surface">
              <span
                className="block h-2 rounded-full bg-chart-3"
                style={{ width: `${Math.max(percent, 1)}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
