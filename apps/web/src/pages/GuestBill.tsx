import { useCallback, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { api, type ApiError } from '../api/client';
import { guestStore } from '../bills/guest';
import { formatCents } from '../bills/money';
import type { Person, SharedBill, Summary } from '../bills/types';
import { usePolling } from '../bills/usePolling';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { Page, primaryButton, row } from '../components/Page';

// What a friend sees after opening the share link (/s/:token). No account needed:
// they type a name once (wireframe #9), then tap what they had (wireframe #10).
export default function GuestBill() {
  const token = useParams().token as string;
  const [bill, setBill] = useState<SharedBill | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [guest, setGuest] = useState(() => guestStore.get(token));
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextBill, nextSummary] = await Promise.all([
        api<SharedBill>(`/share/${token}`),
        api<Summary>(`/share/${token}/summary`),
      ]);
      setBill(nextBill);
      setSummary(nextSummary);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [token]);
  usePolling(load); // every 5 seconds, so friends see each other's taps

  if (!bill)
    return (
      <Page title="Join bill">
        {error ? <FormError message={error} /> : <p>Loading…</p>}
      </Page>
    );

  if (!guest)
    return (
      <JoinForm
        bill={bill}
        onJoin={async (displayName) => {
          const res = await api<{ participant: Person; guestToken: string }>(
            `/share/${token}/participants`,
            { method: 'POST', body: { displayName } },
          );
          const joined = {
            token: res.guestToken,
            participantId: res.participant.id,
          };
          guestStore.set(token, joined);
          setGuest(joined);
          await load();
        }}
      />
    );

  const me = guest.participantId;
  const locked = bill.status !== 'OPEN';
  const names = new Map(bill.participants.map((p) => [p.id, p.displayName]));
  const myTotal =
    summary?.people.find((p) => p.participantId === me)?.totalCents ?? 0;

  // Tap an item to say "I had this"; tap again to take it back
  async function toggle(itemId: string, mine: boolean) {
    setError('');
    try {
      if (mine) {
        await api(`/share/${token}/claims/${itemId}`, {
          method: 'DELETE',
          guestToken: guest!.token,
        });
      } else {
        await api(`/share/${token}/claims`, {
          method: 'POST',
          body: { itemId },
          guestToken: guest!.token,
        });
      }
      await load();
    } catch (err) {
      // The guest token ran out (24 hours) or is for another bill: ask the name again
      if ([401, 403].includes((err as ApiError).status)) {
        guestStore.clear(token);
        setGuest(null);
      } else {
        setError((err as Error).message);
      }
    }
  }

  return (
    <Page title="Tap what you had">
      <p className="text-muted">
        {bill.title} · paid by {bill.owner.displayName}
      </p>
      {locked && (
        <p role="status" className="rounded-[28px] bg-warn/10 p-4 text-warn">
          This bill is locked, so it can't be changed any more.
        </p>
      )}
      <FormError message={error} />
      <ul className="flex flex-col gap-2">
        {bill.items.map((item) => {
          const claimers = item.claims.map((c) => c.participantId);
          const mine = claimers.includes(me);
          const who = claimers.map((id) => (id === me ? 'You' : names.get(id)));
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={mine}
                disabled={locked}
                onClick={() => toggle(item.id, mine)}
                className={`${row} ${mine ? 'border-ink/60 bg-raised' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-full font-semibold ${mine ? 'bg-ink text-on-ink' : 'bg-raised'}`}
                >
                  {mine ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {item.name}
                  </span>
                  <span className="text-sm text-muted">
                    {who.length === 0
                      ? 'Nobody yet'
                      : who.join(', ') + (who.length > 1 ? ' · shared' : '')}
                  </span>
                </span>
                <span className="font-semibold">
                  {formatCents(item.unitPriceCents * item.quantity)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* Stays at the bottom of the screen while the list scrolls */}
      <dl className="hero sticky bottom-4 flex items-end justify-between rounded-[32px] p-6">
        <dt>
          <span className="block text-lg font-medium">My total so far</span>
          <span className="text-sm">incl. service + GST</span>
        </dt>
        <dd className="text-4xl font-semibold tracking-tight">
          {formatCents(myTotal)}
        </dd>
      </dl>
    </Page>
  );
}

function JoinForm(props: {
  bill: SharedBill;
  onJoin: (displayName: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    // The same rule as the API's JoinBillDto
    const problem =
      trimmed.length < 1 || trimmed.length > 30
        ? 'Enter your name (up to 30 characters)'
        : '';
    setNameError(problem);
    if (problem) return;
    setBusy(true);
    setFormError('');
    try {
      await props.onJoin(trimmed);
    } catch (err) {
      setFormError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page title="Join bill">
      <p className="text-muted">
        <span className="block text-xl font-medium text-ink">
          {props.bill.title}
        </span>
        {props.bill.owner.displayName} invited you to split this bill
      </p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Your name"
          name="displayName"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError || undefined}
          hint="No account needed"
        />
        <FormError message={formError} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
    </Page>
  );
}
