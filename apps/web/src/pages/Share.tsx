import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api/client';
import type { Bill } from '../bills/types';
import { usePolling } from '../bills/usePolling';
import { FormError } from '../components/FormError';
import {
  Initial,
  Page,
  plainButton,
  primaryButton,
  row,
  SectionLabel,
} from '../components/Page';

// Wireframe #8: the owner shows a QR code or sends the link, and watches friends join
export default function Share() {
  const { id } = useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    () =>
      api<Bill>(`/bills/${id}`)
        .then(setBill)
        .catch((err: Error) => setError(err.message)),
    [id],
  );
  usePolling(load); // the list of who joined stays fresh

  if (!bill)
    return (
      <Page title="Share" back={`/bills/${id}/edit`}>
        {error ? <FormError message={error} /> : <p>Loading…</p>}
      </Page>
    );

  // The link friends open; it works on whatever site the app is running on
  const link = `${window.location.origin}/s/${bill.shareToken}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <Page title="Share" back={`/bills/${id}/edit`}>
      <p className="text-muted">
        Friends scan this or open the link. No sign-up.
      </p>
      {/* A QR code needs dark squares on white for a camera to read it */}
      <div className="self-center rounded-[32px] bg-white p-5">
        <QRCodeSVG value={link} size={200} title="QR code to join this bill" />
      </div>
      <p className="text-center">
        <span className="block text-sm text-muted">Join code</span>
        <span className="text-4xl font-semibold tracking-[0.2em]">
          {bill.joinCode}
        </span>
      </p>
      <button type="button" onClick={copy} className={primaryButton}>
        {copied ? 'Link copied ✓' : 'Copy link'}
      </button>
      {/* The phone's own share sheet (WhatsApp, Telegram…), where the browser has one */}
      {'share' in navigator && (
        <button
          type="button"
          onClick={() => navigator.share({ title: bill.title, url: link })}
          className={plainButton}
        >
          Share…
        </button>
      )}
      <SectionLabel count={bill.participants.length}>Joined</SectionLabel>
      {bill.participants.length === 0 && (
        <p className="px-2 text-muted">Nobody yet. This updates by itself.</p>
      )}
      <ul className="flex flex-col gap-2">
        {bill.participants.map((person) => (
          <li key={person.id} className={row}>
            <Initial of={person.displayName} />
            <span className="font-medium">{person.displayName}</span>
          </li>
        ))}
      </ul>
      <Link to={`/bills/${id}/summary`} className={plainButton}>
        See summary
      </Link>
    </Page>
  );
}
