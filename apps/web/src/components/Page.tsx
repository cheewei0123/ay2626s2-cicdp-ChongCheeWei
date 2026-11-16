import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Brand } from './Logo';

// The frame of every logged-in page: the logo (on a top-level page) or a round
// back button, then the title and the content
export function Page(props: {
  title: string;
  back?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="rise mx-auto flex min-h-screen max-w-sm flex-col gap-5 px-5 py-6">
      <div className="flex h-12 items-center justify-between">
        {props.back ? (
          <Link to={props.back} aria-label="Back" className={roundButton}>
            ←
          </Link>
        ) : (
          <Brand />
        )}
        {props.action}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{props.title}</h1>
      {props.children}
    </main>
  );
}

// A small heading above a list, with how many things are in it ("Items   3")
export function SectionLabel(props: { children: ReactNode; count?: number }) {
  return (
    <h2 className="flex justify-between px-2 text-sm font-medium">
      {props.children}
      {props.count !== undefined && (
        <span className="text-muted">{props.count}</span>
      )}
    </h2>
  );
}

// The round badge at the start of a row: the first letter of its name
export function Initial({ of }: { of: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-raised font-semibold uppercase"
    >
      {of.trim().charAt(0)}
    </span>
  );
}

// Shared looks, so every screen has the same shapes and big tap targets
export const primaryButton =
  'flex h-14 items-center justify-center rounded-full bg-ink px-6 font-semibold text-on-ink transition active:scale-[0.96] disabled:opacity-50';
export const plainButton =
  'glass flex h-14 items-center justify-center rounded-full px-6 font-medium text-ink transition active:scale-[0.96]';
export const roundButton =
  'glass flex h-12 w-12 items-center justify-center rounded-full text-xl transition active:scale-[0.94]';
export const smallButton =
  'glass flex h-11 items-center rounded-full px-4 text-sm font-medium transition active:scale-[0.96]';
// A row in a list: a glass pill with a badge, two lines of text and a value
export const row =
  'glass flex min-h-18 w-full items-center gap-3 rounded-[28px] p-3 pr-4 text-left transition active:scale-[0.98]';
