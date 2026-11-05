import {
  JOIN_CODE_ALPHABET,
  newJoinCode,
  normaliseJoinCode,
  uniqueName,
} from './join-code.js';

describe('newJoinCode', () => {
  it('makes 5 characters with no look-alikes (0/O, 1/I)', () => {
    for (let i = 0; i < 200; i++) {
      const code = newJoinCode();
      expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/);
    }
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it('gives different codes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => newJoinCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('normaliseJoinCode', () => {
  it('accepts lower case and spaces', () => {
    expect(normaliseJoinCode(' k7p2q ')).toBe('K7P2Q');
  });

  it.each(['K7P2', 'K7P2QQ', 'K0P2Q', 'K7-2Q'])('rejects %s', (code) => {
    expect(normaliseJoinCode(code)).toBeNull();
  });
});

describe('uniqueName', () => {
  it('keeps a name nobody has', () => {
    expect(uniqueName('Ben', ['Chee', 'Ali'])).toBe('Ben');
  });

  it('adds (2), then (3), for repeated names', () => {
    expect(uniqueName('Ben', ['Ben'])).toBe('Ben (2)');
    expect(uniqueName('Ben', ['Ben', 'Ben (2)'])).toBe('Ben (3)');
  });

  it('treats BEN and ben as the same name', () => {
    expect(uniqueName('ben', ['Ben'])).toBe('ben (2)');
  });
});
