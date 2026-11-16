import { useId, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

// A labelled input with its error (or a hint) underneath, read out by screen readers too.
// text-base (16px) stops iPhone Safari zooming in when you tap the field.
export function Field({ label, name, error, hint, ...input }: Props) {
  const id = useId();
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="px-2 text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? `${id}-message` : undefined}
        className={`h-14 rounded-full border bg-surface px-5 text-base text-ink backdrop-blur-xl placeholder:text-faint ${error ? 'border-danger' : 'border-line'}`}
        {...input}
      />
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
