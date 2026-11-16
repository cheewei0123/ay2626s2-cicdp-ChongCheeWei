import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { Page, primaryButton } from '../components/Page';

// The same shape as the API's join codes: 5 characters, without 0/O and 1/I
const CODE = /^[2-9A-HJ-NP-Z]{5}$/;

// Wireframe #19: a friend types the 5-character code read out at the table.
// The code only finds the bill; the next screen (/s/:token) is the same as the link.
export default function JoinCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const typed = code.trim().toUpperCase();
    const problem = CODE.test(typed) ? '' : 'The code is 5 letters and numbers';
    setCodeError(problem);
    if (problem) return;
    setBusy(true);
    setFormError('');
    try {
      const found = await api<{ shareToken: string }>(`/join/${typed}`);
      navigate(`/s/${found.shareToken}`);
    } catch (err) {
      setFormError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page title="Join with a code" back="/login">
      <p className="text-muted">
        Ask the person who paid for the 5-character code.
      </p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Code"
          name="code"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={5}
          placeholder="K7P2Q"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={codeError || undefined}
        />
        <FormError message={formError} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Finding the bill…' : 'Join'}
        </button>
      </form>
    </Page>
  );
}
