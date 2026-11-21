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
