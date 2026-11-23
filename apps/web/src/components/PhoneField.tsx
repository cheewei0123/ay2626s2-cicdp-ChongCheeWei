import { useId } from 'react';
import { localDigits } from '../auth/phone';

// SplitLah is Singapore-only, so +65 is fixed and the user types just the 8 digits
// (IMDA numbering plan: mobile numbers are 8 digits starting with 8 or 9). KAN-89.

type Props = {
  label: string;
  name: string;
  value: string; // the 8 local digits
  onChange: (digits: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
};

export function PhoneField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  disabled,
}: Props) {
  const id = useId();
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="px-2 text-sm font-medium text-muted">
        {label}
      </label>
      <div
        className={`flex h-14 items-center rounded-full border bg-surface backdrop-blur-xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${error ? 'border-danger' : 'border-line'}`}
      >
        {/* Fixed country code: shown, not typed, and not part of the input.
            The focus ring goes round the whole pill instead of the inner box. */}
        <span
          aria-hidden="true"
          className="border-r border-line pl-5 pr-3 text-base font-medium text-muted"
        >
          +65
        </span>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="9123 4567"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(localDigits(e.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? `${id}-message` : undefined}
          className="h-full min-w-0 flex-1 rounded-r-full bg-transparent px-3 text-base text-ink placeholder:text-faint focus-visible:outline-none"
        />
      </div>
      {message && (
        <span
          id={`${id}-message`}
          className={`px-2 text-sm ${error ? 'text-danger' : 'text-muted'}`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
