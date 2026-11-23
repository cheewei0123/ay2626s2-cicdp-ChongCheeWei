import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { localDigits, toE164 } from '../auth/phone';
import { MOBILE_ERROR, SG_MOBILE } from '../auth/validation';
import { formatMobile } from '../bills/money';
import { Field } from './Field';
import { FormError } from './FormError';
import { plainButton } from './Page';
import { PhoneField } from './PhoneField';

const WAIT = 60; // the API sends at most one SMS a minute

// The PayNow number, checked by an SMS code (KAN-91). Friends only get a PayNow QR
// for a checked number, so a typo can't send their money to a stranger. A new
// number only replaces the old one once its code is right.
export function PhoneCheck() {
  const { user, refreshUser } = useAuth();
  const current = user?.paynowMobile ?? null;
  const checked = !!(current && user?.phoneVerifiedAt);

  // Showing the number, typing a number, or typing the code
  const [step, setStep] = useState<'show' | 'number' | 'code'>(
    current ? 'show' : 'number',
  );
  const [digits, setDigits] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [wait, setWait] = useState(0);

  // Counts down to when "Send a new code" works again
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy('');
  };

  const send = (phone: string) =>
    run('Sending…', async () => {
      await api('/me/phone', { method: 'POST', body: { phone } });
      setSentTo(phone);
      setCode('');
      setStep('code');
      setWait(WAIT);
    });

  function onNumber(event: FormEvent) {
    event.preventDefault();
    const ok = SG_MOBILE.test(digits);
    setFieldError(ok ? '' : MOBILE_ERROR);
    if (ok) void send(toE164(digits));
  }

  function onCode(event: FormEvent) {
    event.preventDefault();
    const ok = /^\d{6}$/.test(code);
    setFieldError(ok ? '' : 'Type the 6 digits from the SMS');
    if (!ok) return;
    void run('Checking…', async () => {
      await api('/me/phone/verify', { method: 'POST', body: { code } });
      await refreshUser();
      setStep('show');
    });
  }

  const remove = () =>
    run('Removing…', async () => {
      await api('/me/phone', { method: 'DELETE' });
      await refreshUser();
      setDigits('');
      setStep('number');
    });

  return (
    <section aria-label="PayNow number" className="flex flex-col gap-3">
      <h2 className="px-2 text-sm font-medium text-muted">PayNow number</h2>

      {step === 'show' && current && (
        <div className="glass flex flex-col gap-3 rounded-[28px] p-4">
          <p className="flex items-center justify-between">
            <span className="text-lg font-semibold">
              {formatMobile(current)}
            </span>
            {checked ? (
              <span className="text-sm font-medium text-ok">Checked ✓</span>
            ) : (
              <span className="text-sm font-medium text-warn">Not checked</span>
            )}
          </p>
          <p className="text-sm text-muted">
            {checked
              ? 'Friends get a PayNow QR to this number.'
              : "Friends can't pay you by PayNow QR until you check this number with a code we text to it."}
          </p>
          {!checked && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void send(current)}
              className={plainButton}
            >
              {busy === 'Sending…' ? busy : 'Text me a code'}
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDigits('');
                setFieldError('');
                setStep('number');
              }}
              className={`${plainButton} flex-1`}
            >
              Change number
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void remove()}
              className={plainButton}
            >
              {busy === 'Removing…' ? busy : 'Remove'}
            </button>
          </div>
        </div>
      )}

      {step === 'number' && (
        <form onSubmit={onNumber} noValidate className="flex flex-col gap-3">
          <PhoneField
            label="Mobile number"
            name="phone"
            value={digits}
            onChange={(d) => setDigits(localDigits(d))}
            error={fieldError || undefined}
            hint={
              current
                ? `Your old number ${formatMobile(current)} stays until the new one is checked.`
                : 'We text it a code, so friends can pay you by PayNow QR.'
            }
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!!busy}
              className={`${plainButton} flex-1`}
            >
              {busy || 'Text me a code'}
            </button>
            {current && (
              <button
                type="button"
                onClick={() => setStep('show')}
                className={plainButton}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={onCode} noValidate className="flex flex-col gap-3">
          <p className="px-2 text-sm text-muted">
            We texted a code to {formatMobile(sentTo)}. It works for 10 minutes.
          </p>
          <Field
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={fieldError || undefined}
          />
          <button type="submit" disabled={!!busy} className={plainButton}>
            {busy === 'Checking…' ? busy : 'Check code'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!!busy || wait > 0}
              onClick={() => void send(sentTo)}
              className={`${plainButton} flex-1`}
            >
              {wait > 0 ? `New code in ${wait}s` : 'Send a new code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFieldError('');
                setStep(current ? 'show' : 'number');
              }}
              className={plainButton}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <FormError message={error} />
    </section>
  );
}
