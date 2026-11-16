// Checks what people typed in the "Adjust split" sheet and turns it into the body
// for PATCH /share/:token/claims/:itemId. Plain functions, no React, so every rule
// has a quick unit test. The API checks the same rules again (never trust the browser).

import {
  formatCents,
  formatPercent,
  parseDollars,
  parsePercent,
} from './money';

export type SplitMode = 'EQUAL' | 'PERCENT' | 'SHARES' | 'EXACT';

export type SplitEntry = {
  participantId: string;
  shares?: number;
  percentBp?: number;
  exactCents?: number;
};

export type SplitCheck = {
  entries: SplitEntry[] | null; // null: can't be saved yet
  message: string; // shown under the inputs while typing
};

// values: what is typed for each person, by participant id
export function checkSplit(
  mode: SplitMode,
  ids: string[],
  values: Record<string, string>,
  itemCents: number,
): SplitCheck {
  if (mode === 'EQUAL') {
    return {
      entries: ids.map((participantId) => ({ participantId })),
      message: `${ids.length} people pay the same`,
    };
  }

  if (mode === 'SHARES') {
    // Whole numbers from 1 to 100, e.g. 2 : 1 means one person had twice as much
    const shares = ids.map((id) => {
      const text = (values[id] ?? '').trim();
      return /^\d{1,3}$/.test(text) ? Number(text) : 0;
    });
    if (shares.some((n) => n < 1 || n > 100))
      return { entries: null, message: 'Each share is a number from 1 to 100' };
    return {
      entries: ids.map((participantId, i) => ({
        participantId,
        shares: shares[i],
      })),
      message: `Shares ${shares.join(' : ')}`,
    };
  }

  // PERCENT and EXACT: every box must be a number, and they must add up to the target
  const percent = mode === 'PERCENT';
  const target = percent ? 10000 : itemCents;
  const show = percent ? (n: number) => `${formatPercent(n)}%` : formatCents;
  const amounts = ids.map((id) =>
    percent ? parsePercent(values[id] ?? '') : parseDollars(values[id] ?? ''),
  );
  if (amounts.some((n) => n === null))
    return {
      entries: null,
      message: percent
        ? 'Type a percent for everyone'
        : 'Type an amount for everyone',
    };
  const sum = (amounts as number[]).reduce((a, b) => a + b, 0);
  if (sum !== target)
    return { entries: null, message: `${show(sum)}, need ${show(target)}` };
  return {
    entries: ids.map((participantId, i) => ({
      participantId,
      [percent ? 'percentBp' : 'exactCents']: amounts[i] as number,
    })),
    message: `Total ${show(sum)} ✓`,
  };
}
