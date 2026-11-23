import { createContext, useContext } from 'react';

// The user fields the API sends (never the password hash)
export type User = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  paynowMobile: string | null;
  phoneVerifiedAt: string | null; // null = the number was never checked by SMS (KAN-91)
  mfaEnabledAt: string | null; // null = two-step login is off (KAN-92)
};

export type RegisterInput = {
  displayName: string;
  email: string;
  password: string;
  paynowMobile?: string;
};

// The PayNow number changes through PhoneCheck, which checks it by SMS (KAN-91)
export type ProfileInput = { displayName: string };

export type Auth = {
  user: User | null;
  loading: boolean; // true while a saved token is being checked
  notice: string; // a one-off message for the login page, '' for none
  // Resolves to null when logged in, or to a half-way token when two-step login
  // is on and a code is needed next (KAN-92)
  login: (email: string, password: string) => Promise<string | null>;
  loginWithCode: (mfaToken: string, code: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  saveProfile: (input: ProfileInput) => Promise<void>;
  refreshUser: () => Promise<void>; // asks GET /me again, e.g. after verifying the email
  changePassword: (current: string, next: string) => Promise<void>; // KAN-90
  // Needs the password, and a code when two-step login is on (KAN-93); then logged out
  deleteAccount: (password: string, code?: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<Auth | null>(null);

// Any component inside <AuthProvider> can ask who is logged in
export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
