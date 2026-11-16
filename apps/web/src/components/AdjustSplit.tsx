import { useState } from 'react';
import { formatCents, formatPercent } from '../bills/money';
import { checkSplit, type SplitEntry, type SplitMode } from '../bills/split';
import type { SharedItem } from '../bills/types';
import { FormError } from './FormError';
import { plainButton, primaryButton } from './Page';

const MODES: { mode: SplitMode; label: string; unit: string }[] = [
  { mode: 'EQUAL', label: 'Equal', unit: '' },
  { mode: 'PERCENT', label: '%', unit: '%' },
  { mode: 'SHARES', label: 'Shares', unit: 'shares' },
  { mode: 'EXACT', label: 'Exact', unit: '$' },
];

type Props = {
  item: SharedItem;
  nameOf: (participantId: string) => string;
  onSave: (body: {
    splitMode: SplitMode;
    entries: SplitEntry[];
  }) => Promise<void>;
  onClose: () => void;
};

// Wireframe #11: a sheet that slides over the list, to change how one shared item
// is split: equally, by percent, by shares (2 : 1) or by exact amounts
export function AdjustSplit({ item, nameOf, onSave, onClose }: Props) {
  const ids = item.claims.map((c) => c.participantId);
  const itemCents = item.unitPriceCents * item.quantity;
  const [mode, setMode] = useState<SplitMode>(item.splitMode);
  const [values, setValues] = useState(() => startValues(item, item.splitMode));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const check = checkSplit(mode, ids, values, itemCents);
  const unit = MODES.find((m) => m.mode === mode)!.unit;

  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave({ splitMode: mode, entries: check.entries! });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Split ${item.name}`}
      className="fixed inset-0 z-10 flex items-end bg-black/60"
    >
      <div className="rise mx-auto flex w-full max-w-sm flex-col gap-4 rounded-t-[32px] border border-line bg-bg p-5 pb-8">
        <h2 className="text-xl font-semibold tracking-tight">
          Split {item.name} ({formatCents(itemCents)})
        </h2>
        <div className="glass flex gap-1 rounded-full p-1">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              aria-pressed={mode === m.mode}
              onClick={() => {
                setMode(m.mode);
                setValues(startValues(item, m.mode));
              }}
              className={`h-11 flex-1 rounded-full font-medium ${mode === m.mode ? 'bg-raised text-ink' : 'text-muted'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode !== 'EQUAL' &&
          ids.map((id) => (
            <label key={id} className="flex items-center justify-between gap-3">
              <span className="flex-1 font-medium">{nameOf(id)}</span>
              <input
                aria-label={`${nameOf(id)} ${unit}`}
                inputMode="decimal"
                className="h-12 w-24 rounded-full border border-line bg-surface px-4 text-right text-base"
                value={values[id] ?? ''}
                onChange={(e) => setValues({ ...values, [id]: e.target.value })}
              />
              <span className="w-12 text-sm text-muted">{unit}</span>
            </label>
          ))}
        {/* Tells you while you type whether it adds up */}
        <p role="status" className={check.entries ? 'text-ok' : 'text-warn'}>
          {check.message}
        </p>
        <FormError message={error} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !check.entries}
            onClick={save}
            className={`${primaryButton} flex-1`}
          >
            {busy ? 'Saving…' : 'Save split'}
          </button>
          <button type="button" onClick={onClose} className={plainButton}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// What the boxes start with: the saved values when the item already uses this
// mode, otherwise 1 share each, or empty boxes to fill in
function startValues(item: SharedItem, mode: SplitMode) {
  const saved = item.splitMode === mode;
  return Object.fromEntries(
    item.claims.map((c) => {
      let text = '';
      if (mode === 'SHARES') text = String(saved ? c.shares : 1);
      if (mode === 'PERCENT' && saved && c.percentBp !== null)
        text = formatPercent(c.percentBp);
      if (mode === 'EXACT' && saved && c.exactCents !== null)
        text = formatCents(c.exactCents).slice(1);
      return [c.participantId, text];
    }),
  );
}
