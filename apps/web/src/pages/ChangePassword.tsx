import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { validateNewPassword, type FieldErrors } from '../auth/validation';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { Page, primaryButton } from '../components/Page';

const empty = { current: '', password: '', confirm: '' };

// Profile → Change password (KAN-90). Other devices are logged out; this one stays in.
export default function ChangePassword() {
  const { changePassword } = useAuth();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (value: string) => {
    setForm({ ...form, [field]: value });
    setDone(false);
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateNewPassword(form);
    if (!form.current) found.current = 'Enter your current password';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError('');
    try {
      await changePassword(form.current, form.password);
      setForm(empty);
      setDone(true);
    } catch (err) {
      setFormError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <Page title="Change password" back="/profile">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Current password"
          name="current"
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={(e) => set('current')(e.target.value)}
          error={errors.current}
        />
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
          error={errors.password}
          hint="At least 8 characters"
        />
        <Field
          label="Type it again"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => set('confirm')(e.target.value)}
          error={errors.confirm}
        />
        <FormError message={formError} />
        {done && (
          <p role="status" className="px-2 font-medium text-ok">
            Password changed ✓ Other devices have been logged out.
          </p>
        )}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </Page>
  );
}
