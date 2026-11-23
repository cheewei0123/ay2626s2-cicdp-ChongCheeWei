import { addDays, lastDayOf, monthLabel, type Period } from './dates';
import { CATEGORIES, type MonthSummary } from './types';

// The pie (KAN-94): at most 6 slices, so it stays readable at a glance.
// The 5 biggest categories get their own slice; the rest share one grey slice.
export const MAX_SLICES = 5;

export type Slice = {
  key: string;
  label: string;
  icon: string;
  totalCents: number;
  percent: number; // whole percent, for the label
  share: number; // 0..1, for drawing
  before: number; // the shares of the slices before it, where it starts on the ring
  rank: number | null; // 0 = biggest; null = the grey slice for the rest
};

export function slicesOf(summary: MonthSummary): Slice[] {
  const { byCategory, totalCents } = summary; // already biggest first
  const own = byCategory.slice(0, MAX_SLICES);
  const rest = byCategory.slice(MAX_SLICES);
  const parts: Omit<Slice, 'percent' | 'share' | 'before'>[] = own.map(
    (line, rank) => ({
      key: line.category,
      ...CATEGORIES[line.category],
      totalCents: line.totalCents,
      rank,
    }),
  );
  // One left over keeps its own name; more share a "3 more" slice. Both are grey.
  if (rest.length === 1) {
    parts.push({
      key: rest[0].category,
      ...CATEGORIES[rest[0].category],
      totalCents: rest[0].totalCents,
      rank: null,
    });
  } else if (rest.length > 1) {
    const cents = rest.reduce((sum, line) => sum + line.totalCents, 0);
    parts.push({
      key: 'rest',
      label: `${rest.length} more`,
      icon: '…',
      totalCents: cents,
      rank: null,
    });
  }

  let before = 0;
  return parts.map((part) => {
    const share = part.totalCents / totalCents;
    const slice = { ...part, percent: Math.round(share * 100), share, before };
    before += share;
    return slice;
  });
}

// The columns: one per day for up to a month, else one per month
// (a range is at most 366 days, so that's at most 13 columns)
export type Column = { key: string; label: string; totalCents: number };

export function columnsOf(
  period: Period,
  byDay: MonthSummary['byDay'],
): { unit: 'day' | 'month'; columns: Column[] } {
  const from = 'month' in period ? `${period.month}-01` : period.from;
  const to = 'month' in period ? lastDayOf(period.month) : period.to;
  const spent = new Map(byDay.map((d) => [d.day, d.totalCents]));

  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);

  if (days.length <= 31) {
    return {
      unit: 'day',
      columns: days.map((day) => ({
        key: day,
        label: String(Number(day.slice(8))),
        totalCents: spent.get(day) ?? 0,
      })),
    };
  }

  const months = new Map<string, number>();
  for (const day of days) {
    const month = day.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + (spent.get(day) ?? 0));
  }
  return {
    unit: 'month',
    columns: [...months].map(([month, cents]) => ({
      key: month,
      label: monthLabel(month).slice(0, 3),
      totalCents: cents,
    })),
  };
}
