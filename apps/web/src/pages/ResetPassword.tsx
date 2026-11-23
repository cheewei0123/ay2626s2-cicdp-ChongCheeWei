import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { validateNewPassword, type FieldErrors } from '../auth/validation';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { Page, primaryButton } from '../components/Page';

// Opened from the reset email: /reset-password?token=... (KAN-90).
// Public, because the link may open where you are not logged in.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const { logout } = useAuth();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateNewPassword(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError('');
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token: params.get('token') ?? '', password: form.password },
      });
      logout(); // every old login has ended, this browser's too
      setDone(true);
    } catch (err) {
      setFormError((err as Error).message);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <Page title="Password changed">
        <p role="status" className="text-muted">
          Your new password is set, and you have been logged out everywhere. Log
          in with the new password.
        </p>
        <Link to="/login" className={primaryButton}>
          Log in
        </Link>
      </Page>
    );
  }

  return (
    <Page title="Choose a new password">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
          hint="At least 8 characters"
        />
        <Field
          label="Type it again"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          error={errors.confirm}
        />
        <FormError message={formError} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </Page>
  );
}
