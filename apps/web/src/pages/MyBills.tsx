import { useAuth } from '../auth/context';

// Wireframe #5. For now it only greets you; the bill list comes with creating bills
export default function MyBills() {
  const { user, logout } = useAuth();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My bills</h1>
        <button
          type="button"
          onClick={logout}
          className="h-11 rounded-lg px-4 font-medium text-slate-600"
        >
          Log out
        </button>
      </header>
      <p className="text-slate-600">
        Hi {user?.displayName}! You have no bills yet.
      </p>
    </main>
  );
}
