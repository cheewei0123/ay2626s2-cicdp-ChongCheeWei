import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { Field } from './Field';
import { FormError } from './FormError';
import { plainButton } from './Page';

const dangerButton =
  'flex h-14 items-center justify-center rounded-full bg-danger/10 px-6 font-semibold text-danger transition active:scale-[0.96] disabled:opacity-50';

// Deleting the account (KAN-93): say plainly what happens first, then ask for the
// password (and a code when two-step login is on) so a borrowed phone can't do it.
export function DeleteAccount() {
  const { user, deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const needsCode = !!user?.mfaEnabledAt;

  const close = () => {
    setOpen(false);
    setPassword('');
    setCode('');
    setFieldError('');
    setError('');
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password || (needsCode && !code.trim()))
      return setFieldError(
        needsCode ? 'Type your password and a code' : 'Type your password',
      );
    setFieldError('');
    setBusy(true);
    setError('');
    try {
      // Logged out on success: this screen closes and the login page says so
      await deleteAccount(password, needsCode ? code.trim() : undefined);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section aria-label="Delete account" className="flex flex-col gap-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={dangerButton}
        >
          Delete account
        </button>
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          className="glass flex flex-col gap-3 rounded-[28px] p-4"
        >
          <h2 className="text-lg font-semibold">Delete your account?</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
            <li>
              You are logged out on every device, and can&apos;t log in again.
            </li>
            <li>Links to your bills stop working for friends.</li>
            <li>
              Your bills, spending and PayNow number are kept for 6 months, then
              wiped for good. In friends&apos; bills you stay as a name only.
            </li>
            <li>
              Until then, this email can&apos;t be used for a new account.
            </li>
          </ul>
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={needsCode ? undefined : fieldError || undefined}
          />
          {needsCode && (
            <Field
              label="Code from your app, or a backup code"
              name="code"
              autoComplete="one-time-code"
              autoCapitalize="none"
              maxLength={9}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={fieldError || undefined}
            />
          )}
          <FormError message={error} />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className={`${dangerButton} flex-1`}
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
            <button type="button" onClick={close} className={plainButton}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
