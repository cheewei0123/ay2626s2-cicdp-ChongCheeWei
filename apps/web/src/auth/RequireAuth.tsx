import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './context';

// Wraps pages that need a login; anyone else is sent to /login and comes back afterwards
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return <p className="p-6 text-center text-slate-500">Loading…</p>;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
