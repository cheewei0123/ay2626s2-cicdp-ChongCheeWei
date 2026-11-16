import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { api } from '../api/client';
import { formatCents } from '../bills/money';
import type { Bill, ItemInput } from '../bills/types';
import { ChargeRow } from '../components/ChargeRow';
import { FormError } from '../components/FormError';
import { ItemForm } from '../components/ItemForm';
import {
  Initial,
  Page,
  plainButton,
  primaryButton,
  row,
  SectionLabel,
} from '../components/Page';

// Wireframe #7: check the items, fix what the AI got wrong, set the charges.
// Every change is saved at once and the bill is loaded again, so the totals
// on screen always come from the API's own maths.
export default function EditBill() {
  const { id } = useParams();
  // Set by the scan screen: the total printed on the receipt, if the AI found one
  const receiptTotalCents = (
    useLocation().state as { receiptTotalCents?: number | null } | null
  )?.receiptTotalCents;
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // an item's id, or "new"

  const load = useCallback(
    () =>
      api<Bill>(`/bills/${id}`)
        .then(setBill)
        .catch((err: Error) => setError(err.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // Send one change to the API, then show the bill as it is now
  async function change(path: string, method: string, body?: object) {
    setError('');
    try {
      await api(`/bills/${id}${path}`, { method, body });
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!bill)
    return (
      <Page title="Check items" back="/bills">
        {error ? <FormError message={error} /> : <p>Loading…</p>}
      </Page>
    );

  const { totals } = bill;
  return (
    <Page title="Check items" back="/bills">
      <p className="text-muted">{bill.title}</p>
      <SectionLabel count={bill.items.length}>Items</SectionLabel>
      <ul className="flex flex-col gap-2">
        {bill.items.map((item) =>
          editing === item.id ? (
            <li key={item.id}>
              <ItemForm
                item={item}
                onSave={(input) => change(`/items/${item.id}`, 'PATCH', input)}
                onDelete={() => change(`/items/${item.id}`, 'DELETE')}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={item.id}>
              <button
                type="button"
                aria-label={`Edit ${item.name}`}
                onClick={() => setEditing(item.id)}
                className={row}
              >
                <Initial of={item.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {item.name}
                  </span>
                  <span className="text-sm text-muted">
                    {item.quantity} × {formatCents(item.unitPriceCents)}
                  </span>
                </span>
                <span className="font-semibold">
                  {formatCents(item.unitPriceCents * item.quantity)}
                </span>
                <span aria-hidden="true" className="text-muted">
                  ›
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <ItemForm
          onSave={(input: ItemInput) => change('/items', 'POST', input)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className={plainButton}
        >
          + Add item
        </button>
      )}

      {/* key: when the saved rate changes, the row starts again with the new rate */}
      <section className="glass rounded-[28px] px-4 py-2">
        <ChargeRow
          key={`service-${bill.serviceBp}`}
          label="Service charge"
          bp={bill.serviceBp}
          defaultBp={1000}
          onChange={(serviceBp) => change('', 'PATCH', { serviceBp })}
        />
        <ChargeRow
          key={`gst-${bill.gstBp}`}
          label="GST"
          bp={bill.gstBp}
          defaultBp={900}
          onChange={(gstBp) => change('', 'PATCH', { gstBp })}
        />
      </section>
      <FormError message={error} />

      <dl className="grid grid-cols-2 gap-y-1 hero gap-y-0.5 rounded-[32px] p-6 [&_dd]:text-right">
        <dt>Subtotal</dt>
        <dd>{formatCents(totals.subtotalCents)}</dd>
        <dt>Service charge</dt>
        <dd>{formatCents(totals.serviceCents)}</dd>
        <dt>GST</dt>
        <dd>{formatCents(totals.gstCents)}</dd>
        <dt className="mt-2 self-end text-lg font-medium">Our total</dt>
        <dd className="mt-2 text-4xl font-semibold tracking-tight">
          {formatCents(totals.totalCents)}
        </dd>
      </dl>
      {typeof receiptTotalCents === 'number' &&
        (receiptTotalCents === totals.totalCents ? (
          <p className="px-2 font-medium text-ok">
            Receipt says {formatCents(receiptTotalCents)} ✓
          </p>
        ) : (
          <p role="alert" className="rounded-[28px] bg-warn/10 p-4 text-warn">
            Receipt says {formatCents(receiptTotalCents)}, but our total is{' '}
            {formatCents(totals.totalCents)}. Check the items and charges.
          </p>
        ))}
      <Link to={`/bills/${id}/share`} className={primaryButton}>
        Next: share
      </Link>
    </Page>
  );
}
