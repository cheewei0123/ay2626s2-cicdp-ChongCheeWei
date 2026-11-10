import { describe, expect, it } from 'vitest';
import { validateLogin, validateRegister } from './validation';

const valid = {
  displayName: 'Chee',
  email: 'chee@example.com',
  password: 'correct horse',
  paynowMobile: '',
};

describe('validateRegister (same rules as the API RegisterDto)', () => {
  it('accepts a valid form, with or without a PayNow number', () => {
    expect(validateRegister(valid)).toEqual({});
    expect(validateRegister({ ...valid, paynowMobile: '+6591234567' })).toEqual(
      {},
    );
  });

  it.each([
    [{ displayName: '   ' }, 'displayName'],
    [{ displayName: 'x'.repeat(51) }, 'displayName'],
    [{ email: 'not-an-email' }, 'email'],
    [{ password: 'short' }, 'password'],
    [{ password: 'x'.repeat(129) }, 'password'],
    [{ paynowMobile: '+6512345678' }, 'paynowMobile'], // SG mobiles start with 8 or 9
    [{ paynowMobile: '91234567' }, 'paynowMobile'], // needs +65
  ])('rejects %o', (change, field) => {
    expect(Object.keys(validateRegister({ ...valid, ...change }))).toEqual([
      field,
    ]);
  });

  it('accepts a password of exactly 8 and 128 characters', () => {
    expect(validateRegister({ ...valid, password: 'x'.repeat(8) })).toEqual({});
    expect(validateRegister({ ...valid, password: 'x'.repeat(128) })).toEqual(
      {},
    );
  });
});

describe('validateLogin', () => {
  it('needs an email and a password', () => {
    expect(
      validateLogin({ email: ' chee@example.com ', password: 'x' }),
    ).toEqual({});
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter a valid email address',
      password: 'Enter your password',
    });
  });
});
