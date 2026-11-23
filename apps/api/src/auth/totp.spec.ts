import fc from 'fast-check';
import { open, seal } from './secret-box.js';
import {
  base32Decode,
  base32Encode,
  hotp,
  matchTotp,
  newSecret,
  otpauthUrl,
  stepAt,
} from './totp.js';

// RFC 6238 appendix B: the SHA-1 secret is the ASCII text "12345678901234567890".
// The RFC prints 8 digits; a 6-digit code is the last 6 of them.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (KAN-92)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 test value at %i s', (seconds, code) => {
    const step = stepAt(seconds * 1000);
    expect(hotp(base32Decode(RFC_SECRET), step)).toBe(code);
    expect(matchTotp(RFC_SECRET, code, seconds * 1000)).toBe(step);
  });

  it('allows one step of clock drift either way, not two', () => {
    const at = 1234567890 * 1000;
    expect(matchTotp(RFC_SECRET, '005924', at + 30_000)).not.toBeNull();
    expect(matchTotp(RFC_SECRET, '005924', at - 30_000)).not.toBeNull();
    expect(matchTotp(RFC_SECRET, '005924', at + 60_000)).toBeNull();
  });

  it('refuses a code from a step already used, so a seen code is no good', () => {
    const at = 1234567890 * 1000;
    const used = matchTotp(RFC_SECRET, '005924', at)!;
    expect(matchTotp(RFC_SECRET, '005924', at, used)).toBeNull();
  });

  it('refuses anything that is not 6 digits, and a wrong code', () => {
    const at = 1234567890 * 1000;
    expect(matchTotp(RFC_SECRET, '05924', at)).toBeNull();
    expect(matchTotp(RFC_SECRET, '00592a', at)).toBeNull();
    expect(matchTotp(RFC_SECRET, '005925', at)).toBeNull();
  });

  it('base32 round-trips any bytes, and refuses letters outside it', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 40 }), (bytes) => {
        const buffer = Buffer.from(bytes);
        expect(base32Decode(base32Encode(buffer))).toEqual(buffer);
      }),
    );
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI'); // RFC 4648
    expect(base32Decode('mzxw 6ytb oi==').toString()).toBe('foobar');
    expect(() => base32Decode('MZ1')).toThrow('Not base32: 1');
  });

  it('makes a fresh 160-bit secret and the link authenticator apps scan', () => {
    const secret = newSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(newSecret()).not.toBe(secret);
    expect(otpauthUrl('ABC', 'pat@example.com')).toBe(
      'otpauth://totp/SplitLah%3Apat%40example.com?secret=ABC&issuer=SplitLah&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('secret box (encrypting the TOTP secret at rest)', () => {
  it('opens what it sealed, and never stores the secret as it is', () => {
    const sealed = seal('JBSWY3DPEHPK3PXP', 'jwt-secret');
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(open(sealed, 'jwt-secret')).toBe('JBSWY3DPEHPK3PXP');
    // A new random nonce each time
    expect(seal('JBSWY3DPEHPK3PXP', 'jwt-secret')).not.toBe(sealed);
  });

  it('refuses a changed text, another key, or something that was never sealed', () => {
    const sealed = seal('JBSWY3DPEHPK3PXP', 'jwt-secret');
    const [v, iv, tag, data] = sealed.split('.');
    const flipped = `${data[0] === 'A' ? 'B' : 'A'}${data.slice(1)}`;
    expect(() => open([v, iv, tag, flipped].join('.'), 'jwt-secret')).toThrow();
    expect(() => open(sealed, 'another-secret')).toThrow();
    expect(() => open('JBSWY3DPEHPK3PXP', 'jwt-secret')).toThrow(
      'Not a sealed secret',
    );
  });
});
