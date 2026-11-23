import { useState, type KeyboardEvent } from 'react';
import { formatCents } from '../bills/money';
import { columnsOf } from '../expenses/chart';
import { dayLabel, monthLabel, type Period } from '../expenses/dates';
import type { MonthSummary } from '../expenses/types';

// The size the chart is drawn at; the SVG scales to the card's width
const W = 320;
const TOP = 14; // room for the top line's label
const PLOT = 110;
const BASE = TOP + PLOT;
const H = BASE + 18; // the axis labels sit under the baseline, inside the box

// A column with a rounded top and a square foot, standing on the baseline
function column(x: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height);
  const y = BASE - height;
  return `M${x},${BASE}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${BASE}Z`;
}

// The "over time" view (KAN-94): one column per day (per month for a long range).
// The line above says which column you're on: the biggest, until you tap, hover or
// use the arrow keys. Every expense is also listed under the chart, by day.
export function SpendOverTime(props: {
  period: Period;
  summary: MonthSummary;
}) {
  const { unit, columns } = columnsOf(props.period, props.summary.byDay);
  const max = Math.max(...columns.map((c) => c.totalCents));
  const biggest = columns.findIndex((c) => c.totalCents === max);
  const [picked, setPicked] = useState<number | null>(null);
  const at = picked ?? biggest;
  const current = columns[at];

  const slot = W / columns.length;
  const width = Math.min(24, slot - 2); // ≤ 24px thick, 2px of air between columns
  const name = (key: string) =>
    unit === 'day' ? dayLabel(key) : monthLabel(key);
  // Up to 10 columns (or months) all fit; else every 7th day and the last
  const last = columns.length - 1;
  const labelled = (i: number) =>
    unit === 'month' ||
    columns.length <= 10 ||
    (i % 7 === 0 && last - i >= 3) ||
    i === last;
  // The first and last labels line up with the chart's edges, so none is cut off
  const anchor = (i: number) =>
    i === 0 ? 'start' : i === last ? 'end' : 'middle';
  const labelX = (i: number) =>
    i === 0 ? 0 : i === last ? W : i * slot + slot / 2;

  const move = (event: KeyboardEvent) => {
    const by = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!by) return;
    event.preventDefault();
    setPicked(Math.min(Math.max(at + by, 0), columns.length - 1));
  };

  return (
    <div className="flex flex-col gap-2">
      <p aria-live="polite" className="flex justify-between text-sm">
        <span className="text-muted">
          {picked === null ? `Biggest ${unit}: ` : ''}
          {name(current.key)}
        </span>
        <span className="font-semibold">{formatCents(current.totalCents)}</span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Spending by ${unit}, biggest ${name(columns[biggest].key)} at ${formatCents(max)}. Use the left and right arrow keys to read each ${unit}.`}
        tabIndex={0}
        onKeyDown={move}
        className="w-full rounded-lg"
      >
        <line x1="0" x2={W} y1={TOP} y2={TOP} className="stroke-line" />
        <text x="0" y={TOP - 4} className="fill-muted text-[10px]">
          {formatCents(max)}
        </text>
        {columns.map((c, i) => {
          const x = i * slot + (slot - width) / 2;
          const height = c.totalCents
            ? Math.max((c.totalCents / max) * PLOT, 2)
            : 0;
          return (
            <g key={c.key}>
              {height > 0 && (
                <path
                  d={column(x, width, height)}
                  className={i === at ? 'fill-chart-1' : 'fill-chart-3'}
                />
              )}
              {labelled(i) && (
                <text
                  x={labelX(i)}
                  y={H - 4}
                  textAnchor={anchor(i)}
                  className="fill-muted text-[10px]"
                >
                  {c.label}
                </text>
              )}
              {/* The hit area is the whole slot, not just the column */}
              <rect
                x={i * slot}
                y="0"
                width={slot}
                height={H}
                fill="transparent"
                onMouseEnter={() => setPicked(i)}
                onClick={() => setPicked(i)}
              />
            </g>
          );
        })}
        <line x1="0" x2={W} y1={BASE} y2={BASE} className="stroke-line" />
      </svg>
    </div>
  );
}
