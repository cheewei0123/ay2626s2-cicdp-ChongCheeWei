// Money is whole cents everywhere. These helpers go between what a person types
// or reads ("12.5", "$12.50") and cents (1250), using text and integers only:
// 12.5 * 100 as a decimal number can come out as 1249.9999.

const AMOUNT = /^(\d{1,6})(?:\.(\d{1,2}))?$/;

// "12.5" → 1250, "$6" → 600, "0.05" → 5. null when it isn't an amount.
export function parseDollars(text: string): number | null {
  const match = AMOUNT.exec(text.trim().replace(/^\$/, ''));
  if (!match) return null;
  const cents = (match[2] ?? '').padEnd(2, '0'); // "5" means 50 cents
  return Number(match[1]) * 100 + Number(cents);
}

// 1250 → "$12.50"
export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  return `$${whole}.${String(cents % 100).padStart(2, '0')}`;
}

// Rates are basis points (1000 = 10%). "10" → 1000 and "7.5" → 750: the same
// two-decimal maths as dollars to cents. null above 100% or when not a number.
export function parsePercent(text: string): number | null {
  const bp = parseDollars(text.replace(/%$/, ''));
  return bp === null || bp > 10000 ? null : bp;
}

// 1000 → "10", 750 → "7.5" (only shown, never used in maths)
export function formatPercent(bp: number): string {
  return String(bp / 100);
}
