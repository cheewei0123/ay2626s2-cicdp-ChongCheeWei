import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/context';
import { validateLogin, type FieldErrors } from '../auth/validation';
import { AuthLayout } from '../components/AuthLayout';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { plainButton, primaryButton } from '../components/Page';

export default function Login() {
  const { user, login, loginWithCode } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  // Set after a right password when two-step login is on: then a code is asked (KAN-92)
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

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
      setMfaToken(await login(email.trim(), password));
      setCode('');
    } catch (err) {
      setFormError((err as Error).message); // api() always throws an ApiError with a readable message
    } finally {
      setBusy(false);
    }
  }

  async function onCode(event: FormEvent) {
    event.preventDefault();
    const typed = code.trim();
    if (!/^(\d{6}|[a-z0-9]{4}[\s-]?[a-z0-9]{4})$/i.test(typed)) {
      setErrors({ code: 'Type the 6 digits from your app, or a backup code' });
      return;
    }
    setErrors({});
    setBusy(true);
    setFormError('');
    try {
      await loginWithCode(mfaToken!, typed);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Two-step login: the password was right, now the code from the app
  if (mfaToken)
    return (
      <AuthLayout>
        <form onSubmit={onCode} noValidate className="flex flex-col gap-4">
          <p className="px-2 text-muted">
            Open your authenticator app and type the 6-digit code for SplitLah.
          </p>
          <Field
            label="Code"
            name="code"
            autoComplete="one-time-code"
            autoCapitalize="none"
            maxLength={9}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={errors.code}
            hint="Lost your phone? Type one of your backup codes instead."
          />
          <FormError message={formError} />
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Checking…' : 'Log in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMfaToken(null);
              setFormError('');
              setErrors({});
            }}
            className={plainButton}
          >
            Start again
          </button>
        </form>
      </AuthLayout>
    );

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
        <Link
          to="/forgot-password"
          className="self-end px-2 text-sm font-medium text-muted"
        >
          Forgot password?
        </Link>
        <FormError message={formError} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  );
}
