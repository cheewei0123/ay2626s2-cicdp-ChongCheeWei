import { createGoogleVerifier } from './google.js';

// Google's own library is replaced: a real ID token needs a real Google login
const verifyIdToken = vi.fn();
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

const CLIENT_ID = '1234-abc.apps.googleusercontent.com';
const ticket = (payload: object | undefined) => ({ getPayload: () => payload });

describe('createGoogleVerifier (KAN-95)', () => {
  beforeEach(() => verifyIdToken.mockReset());

  it('is off (null) when GOOGLE_CLIENT_ID is not set', () => {
    expect(createGoogleVerifier({})).toBeNull();
    expect(createGoogleVerifier({ GOOGLE_CLIENT_ID: '  ' })).toBeNull();
  });

  it('refuses a client ID that does not look like one', () => {
    expect(() =>
      createGoogleVerifier({ GOOGLE_CLIENT_ID: 'my-secret' }),
    ).toThrow('GOOGLE_CLIENT_ID must look like');
  });

  it('checks the token against our client ID and returns what SplitLah needs', async () => {
    const google = createGoogleVerifier({ GOOGLE_CLIENT_ID: CLIENT_ID })!;
    expect(google.clientId).toBe(CLIENT_ID);
    verifyIdToken.mockResolvedValue(
      ticket({
        sub: 'g-1',
        email: 'Chee@Gmail.com',
        email_verified: true,
        name: ' Chee Wei ',
      }),
    );

    expect(await google.verify('id-token')).toEqual({
      sub: 'g-1',
      email: 'chee@gmail.com',
      emailVerified: true,
      name: 'Chee Wei',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token',
      audience: CLIENT_ID,
    });
  });

  it('uses the start of the email when Google has no name, and false for an unchecked email', async () => {
    const google = createGoogleVerifier({ GOOGLE_CLIENT_ID: CLIENT_ID })!;
    verifyIdToken.mockResolvedValue(
      ticket({ sub: 'g-1', email: 'pat@example.com' }),
    );
    expect(await google.verify('id-token')).toMatchObject({
      name: 'pat',
      emailVerified: false,
    });
  });

  it('fails when Google rejects the token or sends no email', async () => {
    const google = createGoogleVerifier({ GOOGLE_CLIENT_ID: CLIENT_ID })!;
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient'));
    await expect(google.verify('id-token')).rejects.toThrow('Wrong recipient');
    verifyIdToken.mockResolvedValue(ticket({ sub: 'g-1' }));
    await expect(google.verify('id-token')).rejects.toThrow(
      'Google sent no email',
    );
    verifyIdToken.mockResolvedValue(ticket(undefined));
    await expect(google.verify('id-token')).rejects.toThrow(
      'Google sent no email',
    );
  });
});
