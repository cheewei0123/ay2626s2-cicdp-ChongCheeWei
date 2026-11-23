import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';
import {
  AuthContext,
  type ProfileInput,
  type RegisterInput,
  type User,
} from './context';

type AuthResponse = { user: User; accessToken: string };
type MfaStep = { mfaRequired: true; mfaToken: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // With a saved token, wait for GET /me before deciding if you are logged in
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);
  // A one-off message for the login page, e.g. after deleting the account (KAN-93)
  const [notice, setNotice] = useState('');

  // Forgets the token here and ends the session on the server (KAN-97), so a copy
  // of the token is no use either. Plain fetch, not api(): a 401 here (the session
  // had already ended) must not call logout again.
  const logout = useCallback(() => {
    const token = tokenStore.get();
    tokenStore.clear();
    setUser(null);
    if (token)
      void fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    // A refresh: the token is still saved, so ask the API who it belongs to.
    // An expired token gets 401, which logs you out.
    api<User>('/me')
      .then(setUser)
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  const value = useMemo(() => {
    async function signIn(path: string, body: object) {
      const res = await api<AuthResponse>(path, { method: 'POST', body });
      tokenStore.set(res.accessToken);
      setUser(res.user);
      setNotice('');
    }
    // A password or Google: logged in (null), or a half-way token when two-step
    // login is on and a code is needed next (KAN-92)
    async function firstStep(path: string, body: object) {
      const res = await api<AuthResponse | MfaStep>(path, {
        method: 'POST',
        body,
      });
      if ('mfaRequired' in res) return res.mfaToken;
      tokenStore.set(res.accessToken);
      setUser(res.user);
      setNotice('');
      return null;
    }
    return {
      user,
      loading,
      notice,
      logout,
      login: (email: string, password: string) =>
        firstStep('/auth/login', { email, password }),
      loginWithGoogle: (credential: string) =>
        firstStep('/auth/google', { credential }),
      loginWithCode: (mfaToken: string, code: string) =>
        signIn('/auth/mfa', { mfaToken, code }),
      register: (input: RegisterInput) => signIn('/auth/register', input),
      // PATCH /me answers with the saved profile, so every screen sees the change
      saveProfile: async (input: ProfileInput) =>
        setUser(await api<User>('/me', { method: 'PATCH', body: input })),
      refreshUser: async () => setUser(await api<User>('/me')),
      // Answers with a new token: the old one stops working when the password changes
      changePassword: (currentPassword: string, newPassword: string) =>
        signIn('/me/password', { currentPassword, newPassword }),
      // The server has already ended every session, so the token is only forgotten
      // here. With no user, the app goes to the login page, which shows the notice.
      deleteAccount: async (password: string, code?: string) => {
        await api('/me', { method: 'DELETE', body: { password, code } });
        tokenStore.clear();
        setNotice('Your account is deleted.');
        setUser(null);
      },
    };
  }, [user, loading, notice, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
