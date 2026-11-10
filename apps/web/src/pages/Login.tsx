import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/context';
import { validateLogin, type FieldErrors } from '../auth/validation';
import { AuthLayout } from '../components/AuthLayout';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';

export default function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Logged in (just now, or already): go to the page you wanted, or My bills
  const from = (location.state as { from?: string } | null)?.from ?? '/bills';
  if (user) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateLogin({ email, password });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError('');
    try {
      await login(email.trim(), password);
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
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <FormError message={formError} />
        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-lg bg-emerald-600 font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  );
}
