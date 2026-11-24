import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import { shrinkImage } from '../bills/image';
import type { Bill, ReceiptDraft } from '../bills/types';
import { FormError } from '../components/FormError';
import { Page, plainButton, primaryButton } from '../components/Page';

// Wireframe #6: photograph the receipt and let the AI read the items, or type them in.
// The bill named on the page before is created here, only when it gets content (KAN-99).
export default function ScanReceipt() {
  const title = (useLocation().state as { title?: string } | null)?.title;
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function choose(file: File | undefined) {
    if (!file) return; // the camera was cancelled
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setError('');
  }

  // Opened without a name (a reload, or a typed address): start from step 1
  if (!title) return <Navigate to="/bills/new" replace />;

  const createBill = () =>
    api<Bill>('/bills', { method: 'POST', body: { title } });

  async function read(file: File) {
    setBusy(true);
    setError('');
    try {
      const small = await shrinkImage(file);
      const { id } = await createBill();
      const form = new FormData();
      form.append('image', small, 'receipt.jpg');
      let draft: ReceiptDraft;
      try {
        draft = await api<ReceiptDraft>(`/bills/${id}/receipt`, {
          method: 'POST',
          body: form,
        });
      } catch (err) {
        // Not a receipt, or the reader failed: the new bill is still empty, so it
        // goes again. A retry creates a fresh one.
        await api(`/bills/${id}`, { method: 'DELETE' }).catch(() => {});
        throw err;
      }
      // The AI's answer is only a draft. Put it on the bill (still open, not
      // shared yet) so the next screen can show it for checking and fixing.
      for (const item of draft.items) {
        await api(`/bills/${id}/items`, { method: 'POST', body: item });
      }
      await api(`/bills/${id}`, {
        method: 'PATCH',
        body: { serviceBp: draft.serviceBp, gstBp: draft.gstBp },
      });
      // The printed total goes along, to compare with our total after editing
      navigate(`/bills/${id}/edit`, {
        state: { receiptTotalCents: draft.check.receiptTotalCents },
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function typeIn() {
    setBusy(true);
    setError('');
    try {
      const { id } = await createBill();
      navigate(`/bills/${id}/edit`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page title="Add items" back="/bills">
      {preview && (
        <img
          src={preview}
          alt="Your receipt"
          className="glass max-h-80 rounded-[32px] object-contain p-2"
        />
      )}
      {/* capture opens the back camera on a phone; on a laptop it is a file picker */}
      <label className={photo ? plainButton : primaryButton}>
        {photo ? 'Retake photo' : 'Scan receipt'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>
      {/* No capture: the phone offers Photos, so a receipt can be added later (KAN-88) */}
      <label className={plainButton}>
        Upload from Photos
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>
      {photo && (
        <button
          type="button"
          disabled={busy}
          onClick={() => read(photo)}
          className={primaryButton}
        >
          {busy ? 'Reading receipt…' : 'Read receipt'}
        </button>
      )}
      <FormError message={error} />
      <button
        type="button"
        disabled={busy}
        onClick={typeIn}
        className={plainButton}
      >
        Type it in
      </button>
    </Page>
  );
}
