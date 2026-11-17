import { useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api/client';
import type { Bill, SharedItem, Summary as SummaryData } from '../bills/types';
import { usePolling } from '../bills/usePolling';
import { FormError } from '../components/FormError';
import { Page, plainButton, primaryButton } from '../components/Page';
import { SummaryView } from '../components/SummaryView';

// The owner's bill details also carry each item's claims
type OwnerBill = Bill & { items: SharedItem[] };

// Wireframe #11: what everyone owes, and the owner locks the bill when it's right
export default function Summary() {
  const { id } = useParams();
  const [bill, setBill] = useState<OwnerBill | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextBill, nextSummary] = await Promise.all([
        api<OwnerBill>(`/bills/${id}`),
        api<SummaryData>(`/bills/${id}/summary`),
      ]);
      setBill(nextBill);
      setSummary(nextSummary);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);
  usePolling(load); // friends may still be tapping their items

  // Lock: the split is final and nobody can change it. Unlock: reopen it.
  async function setLocked(lock: boolean) {
    setBusy(true);
    setError('');
    try {
      await api(`/bills/${id}/${lock ? 'lock' : 'unlock'}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  if (!bill || !summary)
    return (
      <Page title="Summary" back={`/bills/${id}/share`}>
        {error ? <FormError message={error} /> : <p>Loading…</p>}
      </Page>
    );

  const me = summary.people.find((p) => p.isOwner)?.participantId;
  const locked = bill.status !== 'OPEN';

  return (
    <Page title="Summary" back={`/bills/${id}/share`}>
      <p className="text-muted">{bill.title}</p>
      {locked && (
        <p role="status" className="rounded-[28px] bg-raised p-4">
          Locked. Nobody can change their items now.
        </p>
      )}
      <SummaryView summary={summary} items={bill.items} me={me} />
      <FormError message={error} />
      {locked ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setLocked(false)}
          className={plainButton}
        >
          {busy ? 'Unlocking…' : 'Unlock to make changes'}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setLocked(true)}
          className={primaryButton}
        >
          {busy ? 'Locking…' : 'Lock bill'}
        </button>
      )}
    </Page>
  );
}
