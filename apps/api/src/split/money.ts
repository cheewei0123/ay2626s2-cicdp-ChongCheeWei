// Singapore bill maths in integer cents. Rates are basis points (1000 = 10%).

export interface BillTotals {
  subtotal: number;
  service: number;
  gst: number;
  total: number;
}

export function serviceCharge(
  _subtotalCents: number,
  _serviceBp: number,
): number {
  throw new Error('Not implemented');
}

export function gst(_amountCents: number, _gstBp: number): number {
  throw new Error('Not implemented');
}

export function billTotals(
  _subtotalCents: number,
  _serviceBp: number,
  _gstBp: number,
): BillTotals {
  throw new Error('Not implemented');
}
