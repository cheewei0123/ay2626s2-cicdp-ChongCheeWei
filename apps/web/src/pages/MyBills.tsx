import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { formatCents } from '../bills/money';
import type { Bill } from '../bills/types';
import { BillActions } from '../components/BillActions';
import { FormError } from '../components/FormError';
import { HomeTabs } from '../components/HomeTabs';
import { SwipeRow, type Side } from '../components/SwipeRow';
import { VerifyBanner } from '../components/VerifyBanner';
import {
  Initial,
  Page,
  primaryButton,
  row,
  SectionLabel,
  smallButton,
} from '../components/Page';
import { shortDay } from '../expenses/dates';

const UNDO_MS = 5000; // how long "Undo" stays before the delete is sent
const SEARCH_FROM = 6; // the search box shows once there are this many bills
const TIP = 'splitlah.swipeTip'; // set once the user has swiped, so the tip goes
const STATUS = { OPEN: 'Open', LOCKED: 'Locked', SETTLED: 'Settled' };

// The same order as GET /bills: newest pin first, then newest bill first
const newest = (key: 'pinnedAt' | 'createdAt') => (a: Bill, b: Bill) =>
  (b[key] ?? '').localeCompare(a[key] ?? '');

// Wireframe #5: my bills, and a button to start a new one. KAN-101: swipe a bill
// right to pin it, left to share or delete it; a long press opens the same actions.
export default function MyBills() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<{ id: string; side: Side }>();
  const [menu, setMenu] = useState<Bill>();
  const [search, setSearch] = useState('');
  const [deleted, setDeleted] = useState<Bill>(); // gone from the list, Undo still possible
  const waiting = useRef<{ bill: Bill; timer: number }>(undefined);
  const [tip, setTip] = useState(() => stored(TIP) !== 'done');

  useEffect(() => {
    api<Bill[]>('/bills')
      .then(setBills)
      .catch((err: Error) => setError(err.message));
  }, []);

  // Leaving the page sends a delete that is still waiting for Undo
  useEffect(() => {
    const box = waiting;
    return () => {
      if (box.current) void sendDelete(box.current.bill).catch(() => {});
    };
  }, []);

  const replace = (bill: Bill) =>
    setBills((list) => list!.map((b) => (b.id === bill.id ? bill : b)));

  // Moves at once, and moves back if the API says no
  async function pin(bill: Bill) {
    const pinned = !bill.pinnedAt;
    replace({ ...bill, pinnedAt: pinned ? now() : null });
    try {
      await api(`/bills/${bill.id}/pin`, {
        method: pinned ? 'POST' : 'DELETE',
      });
    } catch (err) {
      replace(bill);
      setError((err as Error).message);
    }
  }

  // The phone's own share sheet where there is one; otherwise the QR code page
  function share(bill: Bill) {
    const url = `${window.location.origin}/s/${bill.shareToken}`;
    if ('share' in navigator)
      navigator.share({ title: bill.title, url }).catch(() => {});
    else navigate(`/bills/${bill.id}/share`);
  }

  // Gone from the list now; the delete is only sent when Undo has had its chance
  function remove(bill: Bill) {
    if (waiting.current) commit(); // a second delete sends the first one now
    setBills((list) => list!.filter((b) => b.id !== bill.id));
    setDeleted(bill);
    waiting.current = { bill, timer: window.setTimeout(commit, UNDO_MS) };
  }

  function commit() {
    const { bill, timer } = waiting.current!;
    clearTimeout(timer);
    waiting.current = undefined;
    setDeleted(undefined);
    sendDelete(bill).catch((err: Error) => {
      setBills((list) => [...list!, bill]); // the API kept it, so show it again
      setError(err.message);
    });
  }

  function undo() {
    const { bill, timer } = waiting.current!;
    clearTimeout(timer);
    waiting.current = undefined;
    setDeleted(undefined);
    setBills((list) => [...list!, bill]);
  }

  function onSide(id: string, side: Side) {
    setOpen(side ? { id, side } : undefined);
    if (side && tip) {
      setTip(false);
      store(TIP, 'done');
    }
  }

  const term = search.trim().toLowerCase();
  const shown = (bills ?? []).filter((b) =>
    b.title.toLowerCase().includes(term),
  );
  const pinned = shown.filter((b) => b.pinnedAt).sort(newest('pinnedAt'));
  const others = shown.filter((b) => !b.pinnedAt).sort(newest('createdAt'));

  const list = (items: Bill[]) => (
    <ul className="flex flex-col gap-2">
      {items.map((bill) => (
        <li key={bill.id} className="relative">
          <SwipeRow
            start={{
              label: bill.pinnedAt ? 'Unpin' : 'Pin',
              onClick: () => pin(bill),
            }}
            end={[
              { label: 'Share', onClick: () => share(bill) },
              // A locked bill may be paid already, so it can't be deleted (409)
              ...(bill.status === 'OPEN'
                ? [
                    {
                      label: 'Delete',
                      danger: true,
                      onClick: () => remove(bill),
                    },
                  ]
                : []),
            ]}
            side={open?.id === bill.id ? open.side : null}
            onSide={(side) => onSide(bill.id, side)}
            onHold={() => setMenu(bill)}
          >
            {/* An open bill can still be edited; a locked one opens its summary */}
            <Link
              to={`/bills/${bill.id}/${bill.status === 'OPEN' ? 'edit' : 'summary'}`}
              draggable={false}
              className={row}
            >
              <Initial of={bill.title} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{bill.title}</span>
                <span className="text-sm text-muted">
                  {STATUS[bill.status]}
                  {bill.date && ` · ${shortDay(bill.date)}`}
                </span>
              </span>
              <span className="font-semibold">
                {formatCents(bill.totals.totalCents)}
              </span>
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
            </Link>
          </SwipeRow>
          {/* Keyboards and screen readers get the menu from this button; it only
              shows when it has focus */}
          <button
            type="button"
            onClick={() => setMenu(bill)}
            className={`${smallButton} sr-only focus:not-sr-only focus:absolute focus:top-1/2 focus:right-3 focus:-translate-y-1/2`}
          >
            More for {bill.title}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <Page
      title="My bills"
      action={
        <Link to="/profile" className={smallButton}>
          Profile
        </Link>
      }
    >
      <HomeTabs />
      <VerifyBanner />
      <Link to="/bills/new" className={primaryButton}>
        + New bill
      </Link>
      {/* Without a checked number, friends get no PayNow QR (KAN-48, KAN-91) */}
      {user && !user.phoneVerifiedAt && (
        <Link to="/profile" className="rounded-[28px] bg-warn/10 p-4 text-warn">
          {user.paynowMobile
            ? 'Check your PayNow number so friends can pay you back ›'
            : 'Add your PayNow number so friends can pay you back ›'}
        </Link>
      )}
      <FormError message={error} />
      {bills?.length === 0 && !deleted && (
        <p className="text-muted">
          Hi {user?.displayName}! You have no bills yet.
        </p>
      )}
      {/* The bill waiting for Undo still counts, so the box doesn't jump away */}
      {bills && bills.length + (deleted ? 1 : 0) >= SEARCH_FROM && (
        <input
          type="search"
          aria-label="Search bills"
          placeholder="Search bills"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass h-14 rounded-full px-5 text-base placeholder:text-faint"
        />
      )}
      {term && shown.length === 0 && (
        <p className="text-muted">No bills match “{search.trim()}”.</p>
      )}
      {pinned.length > 0 && (
        <>
          <SectionLabel count={pinned.length}>Pinned</SectionLabel>
          {list(pinned)}
        </>
      )}
      {others.length > 0 && (
        <>
          <SectionLabel count={others.length}>Bills</SectionLabel>
          {list(others)}
        </>
      )}
      {tip && shown.length > 0 && (
        <p className="px-2 text-sm text-muted">
          Tip: swipe a bill right to pin it, or left to share or delete it.
          Press and hold for more.
        </p>
      )}
      {deleted && (
        <div
          role="status"
          className="fixed inset-x-5 bottom-6 z-10 border border-line bg-bg shadow-lg shadow-black/50 mx-auto flex h-14 max-w-sm items-center justify-between gap-3 rounded-full pr-2 pl-5"
        >
          <span className="truncate">Deleted {deleted.title}</span>
          <button type="button" onClick={undo} className={smallButton}>
            Undo
          </button>
        </div>
      )}
      {menu && (
        <BillActions
          bill={menu}
          onPin={() => pin(menu)}
          onShare={() => share(menu)}
          onDelete={() => remove(menu)}
          onClose={() => setMenu(undefined)}
        />
      )}
    </Page>
  );
}

const now = () => new Date().toISOString();

const sendDelete = (bill: Bill) =>
  api(`/bills/${bill.id}`, { method: 'DELETE' });

// The phone's storage can be off (private mode), so the tip just shows again
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
