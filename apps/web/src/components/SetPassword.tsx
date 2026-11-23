import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { FormError } from './FormError';
import { plainButton } from './Page';

// For an account made with Google (KAN-95): it has no password, and two-step login
// and deleting the account ask for one. The reset link sets it, and proves the email.
export function SetPassword() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: { email: user!.email },
      });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <section
      aria-label="Password"
      className="glass flex flex-col gap-3 rounded-[28px] p-4"
    >
      <h2 className="text-lg font-semibold">You log in with Google</h2>
      <p className="text-sm text-muted">
        To turn on two-step login or delete your account, first set a password.
        We&apos;ll email you a link to set one.
      </p>
      {sent ? (
        <p role="status" className="font-medium text-ok">
          Check your email for the link ✓
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className={plainButton}
        >
          {busy ? 'Sending…' : 'Email me a link'}
        </button>
      )}
      <FormError message={error} />
    </section>
  );
}
