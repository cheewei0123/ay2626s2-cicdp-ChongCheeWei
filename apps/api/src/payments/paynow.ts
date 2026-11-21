// PayNow QR payloads (SGQR / EMVCo format), built in code: no bank API and no cost.
// A banking app that scans the QR gets the number, the amount and a reference
// filled in. SplitLah never moves money; the friend still presses "Pay" in their bank app.

import { assertWholeNonNegative } from '../split/money.js';

// Singapore mobile number, the same rule as the register form: +65, then 8 digits starting with 8 or 9
export const SG_MOBILE = /^\+65[89]\d{7}$/;

// Name (tag 59) and reference (tag 62-01) are limited to 25 characters by the format
const MAX_TEXT = 25;

export interface PayNowInput {
  mobile: string; // the person being paid, e.g. +6591234567
  amountCents: number; // more than 0
  name: string; // the person being paid, shown in the bank app
  reference: string; // shown on both bank statements
}

// One field: ID (2 digits) + LENGTH (2 digits) + VALUE
export function tlv(id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) {
    throw new RangeError(`id must be 2 digits, got "${id}"`);
  }
  if (value.length > 99) {
    throw new RangeError(`value for ${id} is longer than 99 characters`);
  }
  return id + String(value.length).padStart(2, '0') + value;
}

// CRC-16/CCITT-FALSE: polynomial 0x1021, start 0xFFFF, 4 uppercase hex characters
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// 720 → "7.20", 5 → "0.05" (integers only, like formatCents)
export function formatAmount(cents: number): string {
  assertWholeNonNegative(cents, 'amountCents');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

// Bank apps expect plain ASCII: accents and emoji are dropped, then it is cut to 25 characters.
// Length fields count characters, so a 2-byte character would make the payload invalid.
export function cleanText(text: string): string {
  const ascii = text
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ascii.slice(0, MAX_TEXT).trim();
}

export function buildPayNowPayload(input: PayNowInput): string {
  if (!SG_MOBILE.test(input.mobile)) {
    throw new RangeError('mobile must be a Singapore mobile number');
  }
  assertWholeNonNegative(input.amountCents, 'amountCents');
  if (input.amountCents === 0) {
    throw new RangeError('amountCents must be more than 0');
  }
  const name = cleanText(input.name) || 'SplitLah';
  const reference = cleanText(input.reference);

  const merchant =
    tlv('00', 'SG.PAYNOW') +
    tlv('01', '0') + // 0 = the proxy is a mobile number
    tlv('02', input.mobile) +
    tlv('03', '0'); // 0 = the amount can't be edited in the bank app

  const body =
    tlv('00', '01') + // payload format
    tlv('01', '12') + // 12 = dynamic QR, for one payment of this amount
    tlv('26', merchant) +
    tlv('52', '0000') + // merchant category: none
    tlv('53', '702') + // currency: SGD
    tlv('54', formatAmount(input.amountCents)) +
    tlv('58', 'SG') +
    tlv('59', name) +
    tlv('60', 'Singapore') +
    (reference ? tlv('62', tlv('01', reference)) : '');

  // The CRC covers everything before it, including its own "6304" header
  const withCrcHeader = body + '6304';
  return withCrcHeader + crc16(withCrcHeader);
}
