// Months and days in Singapore time, like the API: an expense at 11pm on 30 Nov
// is in November wherever the phone is.

const SG = 'Asia/Singapore';

// "2026-11-21" for a moment in time, as a Singapore calendar day
export function sgDay(date: Date | string): string {
  // en-CA writes dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: SG }).format(
    new Date(date),
  );
}

// "2026-11"
export const sgMonth = (date: Date = new Date()) => sgDay(date).slice(0, 7);

// "2026-11", +1 → "2026-12"; "2026-01", -1 → "2025-12"
export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

// "2026-11" → "Nov 2026"
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

// "2026-11-21" → "Sat 21 Nov"
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${day}T00:00:00Z`))
    .replace(',', '');
}

// What the Expenses page shows (KAN-94): a whole month, or any run of days,
// both ends included. It lives in the address bar: ?month=2026-11 or ?from=…&to=…
export type Period = { month: string } | { from: string; to: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The address bar → a period. A broken or half range falls back to the month.
export function periodFrom(params: URLSearchParams): Period {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (DAY.test(from) && DAY.test(to) && from <= to) return { from, to };
  return { month: params.get('month') ?? sgMonth() };
}

// A period → the API's query (and the address bar's)
export function periodQuery(period: Period): string {
  return 'month' in period
    ? `month=${period.month}`
    : `from=${period.from}&to=${period.to}`;
}

// "2026-11-21", +3 → "2026-11-24"; days are plain dates, so UTC is safe here
export function addDays(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

// "2026-11" → "2026-11-30"
export const lastDayOf = (month: string) =>
  addDays(`${shiftMonth(month, 1)}-01`, -1);

// "Nov 2026", "3 – 9 Nov 2026", "28 Nov – 4 Dec 2026", "21 Nov 2026"
export function periodLabel(period: Period): string {
  if ('month' in period) return monthLabel(period.month);
  const { from, to } = period;
  const format = (day: string, parts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-SG', { ...parts, timeZone: 'UTC' }).format(
      new Date(`${day}T00:00:00Z`),
    );
  const full = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  if (from === to) return format(to, full);
  const start =
    from.slice(0, 4) !== to.slice(0, 4)
      ? format(from, full)
      : from.slice(0, 7) !== to.slice(0, 7)
        ? format(from, { day: 'numeric', month: 'short' })
        : format(from, { day: 'numeric' });
  return `${start} – ${format(to, full)}`;
}

// The quick picks at the top of the calendar, worked out from today in Singapore
export function presets(today = sgDay(new Date())): {
  label: string;
  period: Period;
}[] {
  const month = today.slice(0, 7);
  return [
    { label: 'This month', period: { month } },
    { label: 'Last month', period: { month: shiftMonth(month, -1) } },
    { label: 'Last 7 days', period: { from: addDays(today, -6), to: today } },
    { label: 'Last 30 days', period: { from: addDays(today, -29), to: today } },
  ];
}

// One month as calendar weeks, Monday first; days from other months are null
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const days = Number(lastDayOf(month).slice(8));
  const cells = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7),
  );
}
