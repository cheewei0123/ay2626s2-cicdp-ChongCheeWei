import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { localDigits, toE164 } from '../auth/phone';
import { MOBILE_ERROR, SG_MOBILE } from '../auth/validation';
import { formatMobile } from '../bills/money';
import { Field } from './Field';
import { FormError } from './FormError';
import { plainButton, primaryButton } from './Page';
import { PhoneField } from './PhoneField';

const WAIT = 60; // the API sends at most one SMS a minute
const POLL_MS = 3000; // how often the page asks whether Telegram has checked the number

type Methods = { telegram: boolean; sms: boolean };

// The PayNow number, checked through the Telegram bot or by an SMS code (KAN-91).
// Friends only get a PayNow QR for a checked number, so a typo can't send their
// money to a stranger. A new number only replaces the old one once it is checked.
export function PhoneCheck() {
  const { user, refreshUser } = useAuth();
  const current = user?.paynowMobile ?? null;
  const checked = !!(current && user?.phoneVerifiedAt);

  // Showing the number, typing a number, typing the SMS code, or waiting on Telegram
  const [step, setStep] = useState<'show' | 'number' | 'code' | 'telegram'>(
    current ? 'show' : 'number',
  );
  const [methods, setMethods] = useState<Methods | null>(null);
  const [digits, setDigits] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [link, setLink] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [wait, setWait] = useState(0);

  // Once the bot has checked the number, the waiting step turns into "Checked ✓"
  const view =
    step === 'telegram' && checked && current === sentTo ? 'show' : step;

  useEffect(() => {
    api<Methods>('/me/phone/methods')
      .then(setMethods)
      .catch(() => setMethods({ telegram: false, sms: true }));
  }, []);

  // Counts down to when "Send a new code" works again
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // While Telegram is open, keep asking the API whether the number is checked yet
  useEffect(() => {
    if (view !== 'telegram') return;
    const timer = setInterval(
      () => void refreshUser().catch(() => {}),
      POLL_MS,
    );
    return () => clearInterval(timer);
  }, [view, refreshUser]);

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

  const telegram = (phone: string) =>
    run('Opening…', async () => {
      const { url } = await api<{ url: string }>('/me/phone/telegram', {
        method: 'POST',
        body: { phone },
      });
      setSentTo(phone);
      setLink(url);
      setStep('telegram');
    });

  // The typed number, or null (with the reason shown) when it isn't a mobile
  function typedNumber() {
    const ok = SG_MOBILE.test(digits);
    setFieldError(ok ? '' : MOBILE_ERROR);
    return ok ? toE164(digits) : null;
  }

  function onNumber(event: FormEvent) {
    event.preventDefault();
    const phone = typedNumber();
    if (phone) void (methods?.telegram ? telegram(phone) : send(phone));
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

  const cancel = () => {
    setFieldError('');
    setStep(current ? 'show' : 'number');
  };

  const noWay = methods && !methods.telegram && !methods.sms;

  return (
    <section aria-label="PayNow number" className="flex flex-col gap-3">
      <h2 className="px-2 text-sm font-medium text-muted">PayNow number</h2>

      {view === 'show' && current && (
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
              : "Friends can't pay you by PayNow QR until you check this number."}
          </p>
          {!checked && methods?.telegram && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void telegram(current)}
              className={primaryButton}
            >
              {busy === 'Opening…' ? busy : 'Check with Telegram'}
            </button>
          )}
          {!checked && methods?.sms && (
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

      {view === 'number' && (
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
                : methods?.telegram
                  ? 'Telegram on this number confirms it is yours, so friends can pay you by PayNow QR.'
                  : 'We text it a code, so friends can pay you by PayNow QR.'
            }
          />
          {noWay && (
            <p className="px-2 text-sm text-warn">
              Checking numbers isn&apos;t set up on this server yet.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!!busy || !methods || !!noWay}
              className={`${methods?.telegram ? primaryButton : plainButton} flex-1`}
            >
              {busy ||
                (methods?.telegram ? 'Check with Telegram' : 'Text me a code')}
            </button>
            {current && (
              <button type="button" onClick={cancel} className={plainButton}>
                Cancel
              </button>
            )}
          </div>
          {methods?.telegram && methods.sms && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                const phone = typedNumber();
                if (phone) void send(phone);
              }}
              className={plainButton}
            >
              No Telegram? Text me a code
            </button>
          )}
        </form>
      )}

      {view === 'telegram' && (
        <div className="glass flex flex-col gap-3 rounded-[28px] p-4">
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>
              Open Telegram on the phone that uses {formatMobile(sentTo)}.
            </li>
            <li>Press Start, then Share my phone number.</li>
            <li>Come back here. This page updates by itself.</li>
          </ol>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className={primaryButton}
          >
            Open Telegram
          </a>
          <p role="status" className="px-2 text-sm text-muted">
            Waiting for Telegram… The link works for 10 minutes.
          </p>
          <button type="button" onClick={cancel} className={plainButton}>
            Cancel
          </button>
        </div>
      )}

      {view === 'code' && (
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
            <button type="button" onClick={cancel} className={plainButton}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <FormError message={error} />
    </section>
  );
}
