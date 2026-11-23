import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

// Encrypts the authenticator secret before it is saved (KAN-92). A password hash can't
// be reversed, but the server must read this secret again to check each code, so it is
// encrypted instead: AES-256-GCM, which also detects any change to the stored text.
// The key is derived from JWT_SECRET (HKDF, its own label), so there is no extra
// setting to manage, and a copy of the database alone can't read the secrets.

function keyFrom(secret: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, Buffer.alloc(0), 'splitlah-mfa-secret', 32),
  );
}

// "v1.<iv>.<tag>.<ciphertext>", each part base64url
export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12); // GCM's standard nonce size; new for every message
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

// Throws if the text was changed or the key is different
export function open(sealed: string, secret: string): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data)
    throw new Error('Not a sealed secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFrom(secret),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
