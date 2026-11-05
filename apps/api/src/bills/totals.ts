import { billTotals, formatCents } from '../split/money.js';

type PricedItem = { unitPriceCents: number; quantity: number };
type BillWithItems = { serviceBp: number; gstBp: number; items: PricedItem[] };

// Adds the receipt totals (service then GST) in cents and as display text.
// Used by both the owner's view and the guest's share view.
export function withTotals<T extends BillWithItems>(bill: T) {
  const subtotal = bill.items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const t = billTotals(subtotal, bill.serviceBp, bill.gstBp);
  return {
    ...bill,
    totals: {
      subtotalCents: t.subtotal,
      serviceCents: t.service,
      gstCents: t.gst,
      totalCents: t.total,
      total: formatCents(t.total),
    },
  };
}
