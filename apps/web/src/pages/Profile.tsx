import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/context';
import { validateProfile, type FieldErrors } from '../auth/validation';
import { DeleteAccount } from '../components/DeleteAccount';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { PhoneCheck } from '../components/PhoneCheck';
import { SetPassword } from '../components/SetPassword';
import { TwoStepLogin } from '../components/TwoStepLogin';
import { Page, plainButton, primaryButton } from '../components/Page';

// Wireframe #3 (slimmed): your name, and the PayNow number friends pay you back on,
// checked by SMS (KAN-91). Uploading a PayNow QR was cut; the number is enough (KAN-48).
export default function Profile() {
  const { user, saveProfile, logout } = useAuth();
  const [form, setForm] = useState({ displayName: user?.displayName ?? '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (field: keyof typeof form) => (value: string) => {
    setForm({ ...form, [field]: value });
    setSaved(false);
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateProfile(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError('');
    try {
      await saveProfile({ displayName: form.displayName.trim() });
      setSaved(true);
    } catch (err) {
      setFormError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <Page title="Profile" back="/bills">
      <p className="text-muted">{user?.email}</p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Name"
          name="displayName"
          autoComplete="name"
          value={form.displayName}
          onChange={(e) => set('displayName')(e.target.value)}
          error={errors.displayName}
          hint="Friends see this on your bills"
        />
        <FormError message={formError} />
        {saved && (
          <p role="status" className="px-2 font-medium text-ok">
            Saved ✓
          </p>
        )}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Saving…' : 'Save name'}
        </button>
      </form>
      <PhoneCheck />
      {/* These need the password, which an account made with Google sets first (KAN-95) */}
      {user?.hasPassword === false ? (
        <SetPassword />
      ) : (
        <>
          <TwoStepLogin />
          <Link to="/profile/password" className={plainButton}>
            Change password
          </Link>
        </>
      )}
      <button type="button" onClick={logout} className={plainButton}>
        Log out
      </button>
      {user?.hasPassword !== false && <DeleteAccount />}
    </Page>
  );
}
