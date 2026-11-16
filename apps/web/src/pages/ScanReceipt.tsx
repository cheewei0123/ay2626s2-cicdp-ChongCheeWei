import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { shrinkImage } from '../bills/image';
import type { ReceiptDraft } from '../bills/types';
import { FormError } from '../components/FormError';
import { Page, plainButton, primaryButton } from '../components/Page';

// Wireframe #6: photograph the receipt and let the AI read the items, or type them in
export default function ScanReceipt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editPage = `/bills/${id}/edit`;

  function choose(file: File | undefined) {
    if (!file) return; // the camera was cancelled
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setError('');
  }

  async function read(file: File) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('image', await shrinkImage(file), 'receipt.jpg');
      const draft = await api<ReceiptDraft>(`/bills/${id}/receipt`, {
        method: 'POST',
        body: form,
      });
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
      navigate(editPage, {
        state: { receiptTotalCents: draft.check.receiptTotalCents },
      });
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
      <Link to={editPage} className={plainButton}>
        Type it in
      </Link>
    </Page>
  );
}
