import { normaliseEmail, trim } from './transforms.js';

describe('DTO transforms', () => {
  it('trims text', () => {
    expect(trim({ value: '  Laksa ' })).toBe('Laksa');
  });

  it('trims and lower-cases an email', () => {
    expect(normaliseEmail({ value: ' Chee@Example.COM ' })).toBe(
      'chee@example.com',
    );
  });

  it.each([123, null, undefined, ['a']])(
    'leaves %o unchanged for the validator to reject',
    (value) => {
      expect(trim({ value })).toBe(value);
      expect(normaliseEmail({ value })).toBe(value);
    },
  );
});
