import { OAuth2Client } from 'google-auth-library';

// What SplitLah needs from a Google sign-in (KAN-95)
export type GoogleProfile = {
  sub: string; // Google's id for the account: never changes, unlike the email
  email: string;
  emailVerified: boolean;
  name: string;
};

// Checks the ID token Google gave the browser. Behind a token (like EMAIL_SERVICE)
// so tests can swap in a fake: a real token needs a real Google login.
export interface GoogleVerifier {
  readonly clientId: string;
  verify(credential: string): Promise<GoogleProfile>;
}

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');

const CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/;

// null when GOOGLE_CLIENT_ID is not set: the button is then hidden and the route
// answers 404. A value that is set but malformed stops the API at start-up.
export function createGoogleVerifier(
  env: Record<string, string | undefined>,
): GoogleVerifier | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return null;
  if (!CLIENT_ID.test(clientId))
    throw new Error(
      'GOOGLE_CLIENT_ID must look like 1234-abc.apps.googleusercontent.com',
    );
  const client = new OAuth2Client(clientId);
  return {
    clientId,
    async verify(credential) {
      // Checks Google's signature (with Google's published keys), that the token
      // was made for our client ID (audience), the issuer, and that it has not expired
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new Error('Google sent no email');
      const email = p.email.toLowerCase();
      return {
        sub: p.sub,
        email,
        emailVerified: p.email_verified === true,
        name: (p.name ?? '').trim() || email.split('@')[0],
      };
    },
  };
}
