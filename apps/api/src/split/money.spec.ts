import { billTotals, gst, serviceCharge } from './money.js';

describe('serviceCharge', () => {
  it('charges 10% of the subtotal', () => {
    expect(serviceCharge(2950, 1000)).toBe(295);
  });

  it('rounds exactly half a cent up', () => {
    // 5 x 10% = 0.5 cents
    expect(serviceCharge(5, 1000)).toBe(1);
  });

  it('rounds less than half a cent down', () => {
    // 4 x 10% = 0.4 cents
    expect(serviceCharge(4, 1000)).toBe(0);
  });
});

describe('gst', () => {
  it('charges 9% and rounds to the nearest cent', () => {
    // 3245 x 9% = 292.05 cents
    expect(gst(3245, 900)).toBe(292);
  });
});

describe('billTotals', () => {
  it('matches the brief: service first, then GST on subtotal + service', () => {
    expect(billTotals(2950, 1000, 900)).toEqual({
      subtotal: 2950,
      service: 295,
      gst: 292,
      total: 3537,
    });
  });

  it('handles a hawker bill with no service charge', () => {
    expect(billTotals(1000, 0, 900)).toEqual({
      subtotal: 1000,
      service: 0,
      gst: 90,
      total: 1090,
    });
  });

  it('returns the subtotal when both rates are 0', () => {
    expect(billTotals(1234, 0, 0)).toEqual({
      subtotal: 1234,
      service: 0,
      gst: 0,
      total: 1234,
    });
  });

  it('throws on a negative subtotal', () => {
    expect(() => billTotals(-100, 1000, 900)).toThrow(RangeError);
  });

  it('throws on a decimal subtotal', () => {
    expect(() => billTotals(29.5, 1000, 900)).toThrow(RangeError);
  });

  it('throws on a negative or decimal rate', () => {
    expect(() => billTotals(2950, -1000, 900)).toThrow(RangeError);
    expect(() => billTotals(2950, 1000, 9.5)).toThrow(RangeError);
  });
});
