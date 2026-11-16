import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Brand, Logo } from './Logo';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 rounded-full py-2.5 text-center font-medium transition ${isActive ? 'bg-raised text-ink' : 'text-muted'}`;

// The frame shared by Log in and Register (wireframe #1): logo, headline and two tabs
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="rise mx-auto flex min-h-screen max-w-sm flex-col gap-6 px-5 py-6">
      <Brand />
      <header className="flex flex-col gap-4">
        <div className="self-center py-2">
          <Logo size={132} moving />
        </div>
        <h1 className="text-4xl leading-tight font-semibold tracking-tighter">
          <span className="block">Split the bill.</span>
          <span className="block">Track the spend.</span>
        </h1>
        <p className="text-muted">
          Scan a receipt, share a link, and everyone pays their exact share by
          PayNow. Your share goes into your monthly expenses by itself.
        </p>
      </header>
      <nav className="glass flex gap-1 rounded-full p-1">
        <NavLink to="/login" className={tab}>
          Log in
        </NavLink>
        <NavLink to="/register" className={tab}>
          Register
        </NavLink>
      </nav>
      {children}
      <Link to="/join" className="py-2 text-center font-medium text-muted">
        Have a code? Join a bill
      </Link>
    </main>
  );
}
