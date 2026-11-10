// A shared bill opened from a link (/s/:token). Anyone can open it, no login needed.
// The real page (join with your name, tap your items) is the next screen to build.
export default function GuestBill() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-bold text-emerald-600">SplitLah</h1>
      <p className="text-slate-600">Opening shared bills is coming soon.</p>
    </main>
  );
}
