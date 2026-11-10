// Months are counted in Singapore time: an expense at 11pm on 30 Nov belongs to November.
// Singapore is UTC+8 all year (no daylight saving), so a fixed offset is exact.
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

// "2026-11" → { start: 1 Nov 00:00 SGT, end: 1 Dec 00:00 SGT }, as UTC instants.
// end is not included: spentAt >= start AND spentAt < end
export function monthRange(month: string) {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1; // JavaScript months start at 0
  return {
    // Date.UTC(2026, 12, 1) rolls over to January 2027 by itself
    start: new Date(Date.UTC(year, index, 1) - SGT_OFFSET_MS),
    end: new Date(Date.UTC(year, index + 1, 1) - SGT_OFFSET_MS),
  };
}

// The month it is right now in Singapore, e.g. "2026-11"
export function currentMonth(now = new Date()): string {
  return new Date(now.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 7);
}
