import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/context';
import { validateProfile, type FieldErrors } from '../auth/validation';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { localDigits, toE164 } from '../auth/phone';
import { PhoneField } from '../components/PhoneField';
import { Page, plainButton, primaryButton } from '../components/Page';

// Wireframe #3 (slimmed): your name and the PayNow number friends pay you back on.
// Uploading a PayNow QR was cut; the number is enough to build the QR (KAN-48).
export default function Profile() {
  const { user, saveProfile, logout } = useAuth();
  const [form, setForm] = useState({
    displayName: user?.displayName ?? '',
    paynowMobile: localDigits(user?.paynowMobile ?? ''),
  });
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
      await saveProfile({
        displayName: form.displayName.trim(),
        // An empty box removes the number (null), rather than saving ""
        paynowMobile: toE164(form.paynowMobile) || null,
      });
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
        <PhoneField
          label="PayNow number"
          name="paynowMobile"
          value={form.paynowMobile}
          onChange={set('paynowMobile')}
          error={errors.paynowMobile}
          hint="Friends get a PayNow QR to this number. Leave it empty to remove it."
        />
        <FormError message={formError} />
        {saved && (
          <p role="status" className="px-2 font-medium text-ok">
            Saved ✓
          </p>
        )}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
      <Link to="/profile/password" className={plainButton}>
        Change password
      </Link>
      <button type="button" onClick={logout} className={plainButton}>
        Log out
      </button>
    </Page>
  );
}
