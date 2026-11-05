import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('never stores the password itself', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).not.toContain('correct horse');
    expect(hash).toMatch(/^scrypt\$/);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  it('gives the same password a different hash each time (random salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects a stored value that is not one of our hashes', async () => {
    expect(await verifyPassword('anything', 'plain-text')).toBe(false);
  });
});
