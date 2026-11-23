import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Authenticator-app codes (TOTP, RFC 6238), as Google Authenticator, Microsoft
// Authenticator and 1Password make them: HMAC-SHA1 of the 30-second step, 6 digits.
// Written with node:crypto alone, so there is no extra package to trust (KAN-92).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 (RFC 4648)
const STEP_SECONDS = 30;

// Apps take the secret as base32 text, e.g. "JBSWY3DPEHPK3PXP"
export function base32Encode(bytes: Buffer): string {
  let out = '';
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const char of text.replace(/[\s=]/g, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Not base32: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// 20 random bytes (160 bits), the size RFC 4226 recommends for HMAC-SHA1
export const newSecret = () => base32Encode(randomBytes(20));

// The 6-digit code for one counter value (RFC 4226 HOTP)
export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', secret).update(message).digest();
  const offset = hash[hash.length - 1] & 0xf; // "dynamic truncation"
  const number = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(number).padStart(6, '0');
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

// The step the code belongs to, or null. One step either side is allowed for a
// phone clock that is a little off. A step at or before `lastUsed` is refused,
// so a code that was seen (over a shoulder, in a log) can't be used again.
export function matchTotp(
  secretBase32: string,
  code: string,
  now = Date.now(),
  lastUsed: number | null = null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const step = stepAt(now);
  for (const candidate of [step - 1, step, step + 1]) {
    if (lastUsed !== null && candidate <= lastUsed) continue;
    const expected = Buffer.from(hotp(secret, candidate));
    if (timingSafeEqual(expected, Buffer.from(code))) return candidate;
  }
  return null;
}

// What the QR code holds: authenticator apps read this standard link
export function otpauthUrl(secretBase32: string, account: string): string {
  const label = encodeURIComponent(`SplitLah:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=SplitLah&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
