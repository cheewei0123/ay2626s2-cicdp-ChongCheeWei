import { useState } from 'react';
import { formatPercent, parsePercent } from '../bills/money';

type Props = {
  label: string;
  bp: number; // the bill's current rate in basis points; 0 = switched off
  defaultBp: number; // the rate used when it is switched on
  onChange: (bp: number) => void;
};

// One charge (service or GST): a switch, and a rate you can edit
export function ChargeRow({ label, bp, defaultBp, onChange }: Props) {
  const [text, setText] = useState(formatPercent(bp));
  const [invalid, setInvalid] = useState(false);

  // Save the typed rate when you leave the field
  function commit() {
    const typed = parsePercent(text);
    setInvalid(typed === null);
    if (typed !== null && typed !== bp) onChange(typed);
  }

  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <label className="flex flex-1 items-center gap-3">
        <input
          type="checkbox"
          className="h-6 w-6 accent-ink"
          checked={bp > 0}
          onChange={(e) => onChange(e.target.checked ? defaultBp : 0)}
        />
        {label}
      </label>
      {bp > 0 && (
        <span className="flex items-center gap-1">
          <input
            aria-label={`${label} rate in percent`}
            aria-invalid={invalid || undefined}
            inputMode="decimal"
            className={`h-11 w-16 rounded-full border bg-surface px-3 text-right text-base text-ink ${invalid ? 'border-danger' : 'border-line'}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
          />
          %
        </span>
      )}
    </div>
  );
}
