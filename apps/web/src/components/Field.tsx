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
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? `${id}-message` : undefined}
        className={`h-12 rounded-lg border px-3 text-base ${error ? 'border-red-500' : 'border-slate-300'}`}
        {...input}
      />
      {message && (
        <span
          id={`${id}-message`}
          className={`text-sm ${error ? 'text-red-600' : 'text-slate-500'}`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
