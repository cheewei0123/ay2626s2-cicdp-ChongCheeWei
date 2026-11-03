// Singapore bill maths in integer cents. Rates are basis points (1000 = 10%).

export interface BillTotals {
  subtotal: number;
  service: number;
  gst: number;
  total: number;
}

function assertWholeNonNegative(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number >= 0, got ${value}`);
  }
}

// amount x rate, rounded half-up to a whole cent using integers only.
// Adding 5000 (half of 10000) before dividing turns floor into "round half up".
function applyRate(amountCents: number, rateBp: number): number {
  return Math.floor((amountCents * rateBp + 5000) / 10000);
}

export function serviceCharge(
  subtotalCents: number,
  serviceBp: number,
): number {
  assertWholeNonNegative(subtotalCents, 'subtotalCents');
  assertWholeNonNegative(serviceBp, 'serviceBp');
  return applyRate(subtotalCents, serviceBp);
}

export function gst(amountCents: number, gstBp: number): number {
  assertWholeNonNegative(amountCents, 'amountCents');
  assertWholeNonNegative(gstBp, 'gstBp');
  return applyRate(amountCents, gstBp);
}

// SG order: service on the subtotal first, then GST on (subtotal + service)
export function billTotals(
  subtotalCents: number,
  serviceBp: number,
  gstBp: number,
): BillTotals {
  const service = serviceCharge(subtotalCents, serviceBp);
  const tax = gst(subtotalCents + service, gstBp);
  return {
    subtotal: subtotalCents,
    service,
    gst: tax,
    total: subtotalCents + service + tax,
  };
}
