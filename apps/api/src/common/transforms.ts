// Used with @Transform(...) in DTOs, before the validation rules run.
// Anything that is not text is left as it is, so the rules can reject it with a clear message.

// "  Laksa " → "Laksa"
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// " Chee@Example.com" → "chee@example.com", so one person can't have two accounts
export const normaliseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
