import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { smallButton } from './Page';

// Until the email is verified, the API refuses new bills and expenses (KAN-77).
// This says why, and asks for a new link if the first one is lost or expired.
export function VerifyBanner() {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerifiedAt) return null;

  async function sendAgain() {
    setBusy(true);
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      setNote('Sent. Check your inbox, and your spam folder.');
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Verify your email"
      className="flex flex-col gap-3 rounded-[28px] bg-warn/10 p-4 text-warn"
    >
      <p>
        Open the link we sent to <strong>{user.email}</strong> to start bills
        and log expenses.
      </p>
      <p role="status" className="text-sm empty:hidden">
        {note}
      </p>
      <button
        type="button"
        onClick={sendAgain}
        disabled={busy}
        className={`${smallButton} self-start text-ink disabled:opacity-50`}
      >
        {busy ? 'Sending…' : 'Send again'}
      </button>
    </section>
  );
}
