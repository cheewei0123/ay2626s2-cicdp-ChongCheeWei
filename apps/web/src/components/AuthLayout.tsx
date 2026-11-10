import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 rounded-lg py-2 text-center font-medium ${isActive ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`;

// The frame shared by Log in and Register (wireframe #1): name, tagline and two tabs
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <header className="text-center">
        <h1 className="text-4xl font-bold text-emerald-600">SplitLah</h1>
        <p className="mt-1 text-slate-500">Split the bill, to the cent</p>
      </header>
      <nav className="flex gap-1 rounded-xl bg-slate-100 p-1">
        <NavLink to="/login" className={tab}>
          Log in
        </NavLink>
        <NavLink to="/register" className={tab}>
          Register
        </NavLink>
      </nav>
      {children}
    </main>
  );
}
