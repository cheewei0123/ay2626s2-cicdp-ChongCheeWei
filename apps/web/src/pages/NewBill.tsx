import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { Bill } from '../bills/types';
import { Field } from '../components/Field';
import { FormError } from '../components/FormError';
import { Page, primaryButton } from '../components/Page';

// Step 1 of a new bill: give it a name. Then choose how to add the items.
export default function NewBill() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    // The same rule as the API's CreateBillDto
    const problem =
      name.length < 1 || name.length > 80
        ? 'Enter a name (up to 80 characters)'
        : '';
    setTitleError(problem);
    if (problem) return;
    setBusy(true);
    setFormError('');
    try {
      const bill = await api<Bill>('/bills', {
        method: 'POST',
        body: { title: name },
      });
      navigate(`/bills/${bill.id}/scan`);
    } catch (err) {
      setFormError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page title="New bill" back="/bills">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="What is this bill for?"
          name="title"
          placeholder="Dinner at Maxwell"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={titleError || undefined}
        />
        <FormError message={formError} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Creating…' : 'Next: add items'}
        </button>
      </form>
    </Page>
  );
}
