import { createContext, useContext } from 'react';

// The user fields the API sends (never the password hash)
export type User = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  paynowMobile: string | null;
};

export type RegisterInput = {
  displayName: string;
  email: string;
  password: string;
  paynowMobile?: string;
};

export type Auth = {
  user: User | null;
  loading: boolean; // true while a saved token is being checked
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<Auth | null>(null);

// Any component inside <AuthProvider> can ask who is logged in
export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
