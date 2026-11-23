import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import { validateEmail } from '../auth/validation';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { Page, plainButton, primaryButton } from '../components/Page';

// "Forgot password?" from Log in (KAN-90): asks for a reset link by email.
// The answer is the same whether or not the email has an account.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateEmail(email);
    setError(found);
    if (found) return;
    setBusy(true);
    setFormError('');
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setSentTo(email.trim());
    } catch (err) {
      setFormError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <Page title="Forgot password" back="/login">
      {sentTo ? (
        <p role="status" className="text-muted">
          If {sentTo} has an account, we have emailed it a link to choose a new
          password. The link expires in 30 minutes.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-muted">
            Enter your email and we will send you a link to choose a new
            password.
          </p>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error || undefined}
          />
          <FormError message={formError} />
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <Link to="/login" className={plainButton}>
        Back to log in
      </Link>
    </Page>
  );
}
