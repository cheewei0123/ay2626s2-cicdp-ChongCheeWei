import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/context';
import { validateRegister, type FieldErrors } from '../auth/validation';
import { AuthLayout } from '../components/AuthLayout';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';

export default function Register() {
  const { user, register } = useAuth();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    paynowMobile: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Registering also logs you in, so you land on My bills
  if (user) return <Navigate to="/bills" replace />;

  const set =
    (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [field]: e.target.value });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateRegister(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError('');
    try {
      await register({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password,
        // The PayNow number is optional; leave it out rather than send ""
        paynowMobile: form.paynowMobile.trim() || undefined,
      });
    } catch (err) {
      setFormError((err as Error).message); // api() always throws an ApiError with a readable message
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Name"
          name="displayName"
          autoComplete="name"
          value={form.displayName}
          onChange={set('displayName')}
          error={errors.displayName}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 8 characters"
        />
        <Field
          label="PayNow number (optional)"
          name="paynowMobile"
          type="tel"
          autoComplete="tel"
          placeholder="+6591234567"
          value={form.paynowMobile}
          onChange={set('paynowMobile')}
          error={errors.paynowMobile}
          hint="Friends pay you here"
        />
        <FormError message={formError} />
        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-lg bg-emerald-600 font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
