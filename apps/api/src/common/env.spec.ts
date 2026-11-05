import { requireEnv } from './env.js';

describe('requireEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns the value when it is set', () => {
    vi.stubEnv('SOME_SETTING', 'abc');
    expect(requireEnv('SOME_SETTING')).toBe('abc');
  });

  it('stops with a clear message when it is missing', () => {
    vi.stubEnv('SOME_SETTING', '');
    expect(() => requireEnv('SOME_SETTING')).toThrow('SOME_SETTING is not set');
  });
});
