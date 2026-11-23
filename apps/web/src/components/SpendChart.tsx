import { useState } from 'react';
import type { Period } from '../expenses/dates';
import type { MonthSummary } from '../expenses/types';
import { CategoryBars } from './CategoryBars';
import { CategoryPie } from './CategoryPie';
import { SpendOverTime } from './SpendOverTime';

const VIEWS = [
  { id: 'bars', label: 'Bars' },
  { id: 'pie', label: 'Pie' },
  { id: 'time', label: 'Over time' },
] as const;
type View = (typeof VIEWS)[number]['id'];

// The phone remembers the last view picked. Storage can be off (private mode),
// so a failure just means starting on Bars.
const KEY = 'splitlah.chart';
function saved(): View {
  try {
    const view = localStorage.getItem(KEY);
    return VIEWS.some((v) => v.id === view) ? (view as View) : 'bars';
  } catch {
    return 'bars';
  }
}

// Where the money went, three ways (KAN-94): ranked bars, a pie, or over time
export function SpendChart(props: { period: Period; summary: MonthSummary }) {
  const [view, setView] = useState<View>(saved);
  const pick = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // not saved; it still switches
    }
  };

  return (
    <section
      aria-label="Spending chart"
      className="glass flex flex-col gap-4 rounded-[28px] p-4"
    >
      <div
        role="tablist"
        aria-label="Chart type"
        className="flex gap-1 rounded-full bg-surface p-1"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`chart-${v.id}`}
            aria-selected={view === v.id}
            aria-controls="chart-panel"
            onClick={() => pick(v.id)}
            className={`h-11 flex-1 rounded-full text-sm font-medium ${view === v.id ? 'bg-raised text-ink' : 'text-muted'}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div id="chart-panel" role="tabpanel" aria-labelledby={`chart-${view}`}>
        {view === 'bars' && <CategoryBars summary={props.summary} />}
        {view === 'pie' && <CategoryPie summary={props.summary} />}
        {view === 'time' && (
          <SpendOverTime period={props.period} summary={props.summary} />
        )}
      </div>
    </section>
  );
}
