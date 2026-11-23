import { useState } from 'react';
import { formatCents } from '../bills/money';
import { slicesOf } from '../expenses/chart';
import type { MonthSummary } from '../expenses/types';

// The ring is drawn with one circle per slice: each one's dash is its share of the ring.
const R = 62;
const RING = 2 * Math.PI * R;
const GAP = 2.5; // the 2px of page between slices, in viewBox units

// Colour means rank here (biggest = brightest), so it never has to tell 6 hues apart;
// the legend row beside each swatch says which category it is (ui-design.md, Charts)
const STROKE = [
  'stroke-chart-1',
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
];
const SWATCH = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
];
const shade = (rank: number | null, list: string[], other: string) =>
  rank === null ? other : list[rank];

// The pie view (KAN-94): a ring of at most 6 slices, the biggest's share in the middle
// (or the one under your finger), and every slice's $ and % in the list below it
export function CategoryPie({ summary }: { summary: MonthSummary }) {
  const slices = slicesOf(summary);
  const [active, setActive] = useState(slices[0].key);
  const shown = slices.find((s) => s.key === active) ?? slices[0];
  const whole = slices.length === 1; // one slice is a full ring, no gap

  const arcs = slices.map((s) => ({
    ...s,
    className: shade(s.rank, STROKE, 'stroke-chart-other'),
    dash: whole
      ? `${RING} 0`
      : `${Math.max(s.share * RING - GAP, 0.5)} ${RING}`,
    offset: -s.before * RING,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto h-44 w-44">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={`Pie chart: ${slices.map((s) => `${s.label} ${s.percent}%`).join(', ')}`}
          className="h-full w-full -rotate-90"
        >
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              strokeWidth="22"
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              className={`${a.className} ${a.key === shown.key ? '' : 'opacity-60'}`}
              onMouseEnter={() => setActive(a.key)}
              onClick={() => setActive(a.key)}
            />
          ))}
        </svg>
        <p
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-2xl font-semibold">{shown.percent}%</span>
          <span className="max-w-24 truncate text-xs text-muted">
            {shown.label}
          </span>
        </p>
      </div>
      <ul aria-label="Spending by category" className="flex flex-col gap-2">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className={`h-3 w-3 flex-none rounded-full ${shade(s.rank, SWATCH, 'bg-chart-other')}`}
            />
            <span className="min-w-0 flex-1 truncate">
              <span aria-hidden="true">{s.icon}</span> {s.label}
            </span>
            <span className="font-semibold">{formatCents(s.totalCents)}</span>
            <span className="w-10 text-right text-muted">{s.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
