import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { api } from '../api/client';
import { formatCents } from '../bills/money';
import {
  formOf,
  toBody,
  validateExpense,
  type ExpenseErrors,
} from '../expenses/form';
import type { Expense } from '../expenses/types';
import { ExpenseFields } from './ExpenseFields';
import { FormError } from './FormError';
import { plainButton, primaryButton } from './Page';

type Props = { expense: Expense; onDone: () => void; onClose: () => void };

// A sheet over the list to fix an expense or delete it. A bill share only lets you
// change its category and note: the rest comes from the bill.
export function EditExpense({ expense, onDone, onClose }: Props) {
  const fromBill = expense.source === 'BILL_SHARE';
  const [form, setForm] = useState(() => formOf(expense));
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(request: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await request();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function save() {
    // Only these two may change on a bill share (the API answers 409 to the rest)
    if (fromBill) {
      return run(() =>
        api(`/expenses/${expense.id}`, {
          method: 'PATCH',
          body: { category: form.category, note: form.note.trim() },
        }),
      );
    }
    const found = validateExpense(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = toBody(form);
    return run(() =>
      api(`/expenses/${expense.id}`, {
        method: 'PATCH',
        // An emptied box clears the text instead of keeping the old one
        body: { ...body, merchant: body.merchant ?? '', note: body.note ?? '' },
      }),
    );
  }

  // Drawn straight into <body>: the page's rise animation leaves a transform on
  // <main>, and "fixed" inside a transformed parent follows the page, not the screen
  return createPortal(
    <div
      role="dialog"
      aria-label="Edit expense"
      className="fixed inset-0 z-10 flex items-end bg-black/60"
    >
      <div className="rise mx-auto flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-t-[32px] border border-line bg-bg p-5 pb-8">
        <h2 className="text-xl font-semibold tracking-tight">
          {expense.merchant || 'Expense'} ({formatCents(expense.amountCents)})
        </h2>
        {fromBill && (
          <p className="text-sm text-muted">
            Your share of a split bill. The amount and date come from the bill.{' '}
            <Link
              to={`/bills/${expense.billId}/summary`}
              className="font-medium text-ink underline"
            >
              Open the bill ›
            </Link>
          </p>
        )}
        <ExpenseFields
          form={form}
          errors={errors}
          onChange={setForm}
          fromBill={fromBill}
        />
        <FormError message={error} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className={`${primaryButton} flex-1`}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className={plainButton}>
            Cancel
          </button>
        </div>
        {!fromBill && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() => api(`/expenses/${expense.id}`, { method: 'DELETE' }))
            }
            className="h-11 font-medium text-danger"
          >
            Delete expense
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
