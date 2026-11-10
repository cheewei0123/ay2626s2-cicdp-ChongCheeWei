import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';
import { AuthContext, type RegisterInput, type User } from './context';

type AuthResponse = { user: User; accessToken: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // With a saved token, wait for GET /me before deciding if you are logged in
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
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
    }
    return {
      user,
      loading,
      logout,
      login: (email: string, password: string) =>
        signIn('/auth/login', { email, password }),
      register: (input: RegisterInput) => signIn('/auth/register', input),
    };
  }, [user, loading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
