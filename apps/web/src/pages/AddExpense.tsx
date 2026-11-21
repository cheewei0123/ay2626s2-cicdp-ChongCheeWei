import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { formatCents } from '../bills/money';
import { shrinkImage } from '../bills/image';
import { ExpenseFields } from '../components/ExpenseFields';
import { FormError } from '../components/FormError';
import { Page, plainButton, primaryButton } from '../components/Page';
import {
  emptyForm,
  toBody,
  validateExpense,
  type ExpenseErrors,
} from '../expenses/form';
import { sgMonth } from '../expenses/dates';
import type { ExpenseDraft } from '../expenses/types';

// Wireframe #14: type an expense in, or scan a receipt and check what the AI read
export default function AddExpense() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = `/expenses?month=${params.get('month') ?? sgMonth()}`;
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState<'' | 'reading' | 'saving'>('');

  async function scan(file: File | undefined) {
    if (!file) return; // the camera was cancelled
    setBusy('reading');
    setError('');
    try {
      const body = new FormData();
      body.append('image', await shrinkImage(file), 'receipt.jpg');
      const draft = await api<ExpenseDraft>('/expenses/receipt', {
        method: 'POST',
        body,
      });
      // Only a draft: it fills the form, and nothing is saved until "Save expense"
      setForm({
        ...form,
        amount: formatCents(draft.amountCents).slice(1),
        category: draft.category,
        merchant: draft.merchant ?? '',
        date: draft.spentAt?.slice(0, 10) ?? form.date,
      });
      setScanned(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateExpense(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy('saving');
    setError('');
    try {
      await api('/expenses', {
        method: 'POST',
        body: { ...toBody(form), source: scanned ? 'RECEIPT' : 'MANUAL' },
      });
      // Back to the month the expense is in
      navigate(`/expenses?month=${form.date.slice(0, 7)}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy('');
    }
  }

  return (
    <Page title="Add expense" back={back}>
      {/* capture opens the back camera on a phone; on a laptop it is a file picker */}
      <label className={plainButton}>
        {busy === 'reading'
          ? 'Reading receipt…'
          : scanned
            ? 'Scan another receipt'
            : 'Scan a receipt'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy !== ''}
          onChange={(e) => scan(e.target.files?.[0])}
        />
      </label>
      {scanned && (
        <p role="status" className="px-2 text-sm text-ok">
          Read from your receipt. Check it, then save.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ExpenseFields form={form} errors={errors} onChange={setForm} />
        <FormError message={error} />
        <button type="submit" disabled={busy !== ''} className={primaryButton}>
          {busy === 'saving' ? 'Saving…' : 'Save expense'}
        </button>
      </form>
    </Page>
  );
}
