import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { Field } from './Field';
import { FormError } from './FormError';
import { plainButton, primaryButton } from './Page';

type Status = { on: boolean; backupCodesLeft: number };
type Setup = { secret: string; otpauthUrl: string };

// "JBSW Y3DP EHPK …": easier to read and type than 32 letters in a row
const grouped = (secret: string) => secret.match(/.{1,4}/g)!.join(' ');

// Two-step login with an authenticator app (KAN-92): turn it on (password → scan the
// QR → first code → save the backup codes), or off (password + a code).
export function TwoStepLogin() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<
    'show' | 'password' | 'scan' | 'codes' | 'off'
  >('show');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // If the status can't be read, the section just stays empty: nothing to act on
  const load = () =>
    api<Status>('/me/mfa')
      .then(setStatus)
      .catch(() => undefined);

  useEffect(() => {
    void load();
  }, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  const begin = (next: typeof step) => {
    setPassword('');
    setCode('');
    setFieldError('');
    setError('');
    setStep(next);
  };

  function onPassword(event: FormEvent) {
    event.preventDefault();
    if (!password) return setFieldError('Type your password');
    setFieldError('');
    void run(async () => {
      setSetup(
        await api<Setup>('/me/mfa/setup', {
          method: 'POST',
          body: { password },
        }),
      );
      setPassword('');
      setStep('scan');
    });
  }

  function onFirstCode(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code))
      return setFieldError('Type the 6 digits from your app');
    setFieldError('');
    void run(async () => {
      const { backupCodes: codes } = await api<{ backupCodes: string[] }>(
        '/me/mfa/enable',
        { method: 'POST', body: { code } },
      );
      setBackupCodes(codes);
      setSetup(null);
      setStep('codes');
    });
  }

  function onTurnOff(event: FormEvent) {
    event.preventDefault();
    if (!password || !code.trim())
      return setFieldError('Type your password and a code');
    setFieldError('');
    void run(async () => {
      await api('/me/mfa/disable', {
        method: 'POST',
        body: { password, code: code.trim() },
      });
      await Promise.all([refreshUser(), load()]);
      begin('show');
    });
  }

  const savedCodes = () =>
    run(async () => {
      setBackupCodes([]);
      await Promise.all([refreshUser(), load()]);
      setStep('show');
    });

  const cancel = (
    <button type="button" onClick={() => begin('show')} className={plainButton}>
      Cancel
    </button>
  );

  return (
    <section aria-label="Two-step login" className="flex flex-col gap-3">
      <h2 className="px-2 text-sm font-medium text-muted">Two-step login</h2>

      {step === 'show' && status && (
        <div className="glass flex flex-col gap-3 rounded-[28px] p-4">
          <p className="flex items-center justify-between">
            <span className="text-lg font-semibold">Authenticator app</span>
            {status.on ? (
              <span className="text-sm font-medium text-ok">On ✓</span>
            ) : (
              <span className="text-sm font-medium text-muted">Off</span>
            )}
          </p>
          <p className="text-sm text-muted">
            {status.on
              ? `Each login asks for a code from your app. ${status.backupCodesLeft} backup ${status.backupCodesLeft === 1 ? 'code' : 'codes'} left.`
              : 'Each login will also ask for a code from an app like Google Authenticator, so a stolen password is not enough.'}
          </p>
          <button
            type="button"
            onClick={() => begin(status.on ? 'off' : 'password')}
            className={status.on ? plainButton : primaryButton}
          >
            {status.on ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}

      {step === 'password' && (
        <form onSubmit={onPassword} noValidate className="flex flex-col gap-3">
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldError || undefined}
            hint="To turn on two-step login, type your password again."
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className={`${primaryButton} flex-1`}
            >
              {busy ? 'Checking…' : 'Continue'}
            </button>
            {cancel}
          </div>
        </form>
      )}

      {step === 'scan' && setup && (
        <form onSubmit={onFirstCode} noValidate className="flex flex-col gap-3">
          <p className="px-2 text-sm text-muted">
            In your authenticator app, add an account and scan this QR code.
          </p>
          {/* A QR code needs dark squares on white for a camera to read it */}
          <div className="self-center rounded-[24px] bg-white p-4">
            <QRCodeSVG
              value={setup.otpauthUrl}
              size={200}
              title="QR code to add SplitLah to your authenticator app"
            />
          </div>
          <p className="px-2 text-sm text-muted">
            On this phone? Type this key into the app instead:
          </p>
          <p className="glass select-all rounded-[20px] px-4 py-3 text-center font-mono text-base tracking-wider break-all">
            {grouped(setup.secret)}
          </p>
          <Field
            label="6-digit code from the app"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={fieldError || undefined}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className={`${primaryButton} flex-1`}
            >
              {busy ? 'Checking…' : 'Turn on'}
            </button>
            {cancel}
          </div>
        </form>
      )}

      {step === 'codes' && (
        <div className="glass flex flex-col gap-3 rounded-[28px] p-4">
          <p role="status" className="font-medium text-ok">
            Two-step login is on ✓
          </p>
          <p className="text-sm text-muted">
            Save these backup codes somewhere safe, like a password manager.
            Each one works once if you lose your phone. They won&apos;t be shown
            again.
          </p>
          <ul
            aria-label="Backup codes"
            className="grid grid-cols-2 gap-2 font-mono text-base"
          >
            {backupCodes.map((c) => (
              <li
                key={c}
                className="rounded-[14px] bg-surface px-3 py-2 text-center"
              >
                {c}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() => void savedCodes()}
            className={primaryButton}
          >
            I&apos;ve saved them
          </button>
        </div>
      )}

      {step === 'off' && (
        <form onSubmit={onTurnOff} noValidate className="flex flex-col gap-3">
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Code from your app, or a backup code"
            name="code"
            autoComplete="one-time-code"
            autoCapitalize="none"
            maxLength={9}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={fieldError || undefined}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className={`${plainButton} flex-1`}
            >
              {busy ? 'Turning off…' : 'Turn off'}
            </button>
            {cancel}
          </div>
        </form>
      )}

      <FormError message={error} />
    </section>
  );
}
