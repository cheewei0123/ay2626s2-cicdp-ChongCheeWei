import { Brand } from '../components/Logo';

// A shared bill opened from a link (/s/:token). Anyone can open it, no login needed.
// The real page (join with your name, tap your items) is the next screen to build.
export default function GuestBill() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <Brand />
      <p className="text-muted">Opening shared bills is coming soon.</p>
    </main>
  );
}
