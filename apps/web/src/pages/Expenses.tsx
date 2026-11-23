import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { formatCents } from '../bills/money';
import { EditExpense } from '../components/EditExpense';
import { FormError } from '../components/FormError';
import { HomeTabs } from '../components/HomeTabs';
import { RangePicker } from '../components/RangePicker';
import { SpendChart } from '../components/SpendChart';
import { VerifyBanner } from '../components/VerifyBanner';
import {
  Page,
  primaryButton,
  roundButton,
  row,
  SectionLabel,
  smallButton,
} from '../components/Page';
import {
  addDays,
  dayLabel,
  periodFrom,
  periodLabel,
  periodQuery,
  sgDay,
  shiftMonth,
  type Period,
} from '../expenses/dates';
import {
  CATEGORIES,
  SOURCE_LABELS,
  type Expense,
  type ExpensePage,
  type MonthSummary,
} from '../expenses/types';

const PAGE_SIZE = 100; // the API's most per page; a month rarely has more

// Wireframe #13: what I spent this month (or any days, KAN-94), by category and by day
export default function Expenses() {
  const [params, setParams] = useSearchParams();
  const period = periodFrom(params);
  const query = periodQuery(period);
  const label = periodLabel(period);
  const [picking, setPicking] = useState(false);
  const [data, setData] = useState<{
    list: ExpensePage;
    summary: MonthSummary;
  } | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);

  // Bumped after an edit, so the same period loads again
  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);

  useEffect(() => {
    Promise.all([
      api<ExpensePage>(`/expenses?${query}&pageSize=${PAGE_SIZE}`),
      api<MonthSummary>(`/expenses/summary?${query}`),
    ])
      .then(([list, summary]) => {
        setData({ list, summary });
        setError('');
      })
      .catch((err: Error) => setError(err.message));
  }, [query, version]);

  const show = (next: Period) => {
    setPicking(false);
    setData(null);
    setParams(new URLSearchParams(periodQuery(next)));
  };
  // ‹ › step a month, or a range by its own length (7 days → the 7 before or after)
  const go = (by: number) => {
    if ('month' in period) return show({ month: shiftMonth(period.month, by) });
    const length =
      (Date.parse(period.to) - Date.parse(period.from)) / 86_400_000 + 1;
    show({
      from: addDays(period.from, by * length),
      to: addDays(period.to, by * length),
    });
  };
  const unit = 'month' in period ? 'month' : 'days';
  // Add expense starts on the shown month (or the range's last day's month)
  const addMonth = 'month' in period ? period.month : period.to.slice(0, 7);
  const days = data ? byDay(data.list.items) : [];

  return (
    <Page
      title="Expenses"
      action={
        <Link to="/profile" className={smallButton}>
          Profile
        </Link>
      }
    >
      <HomeTabs />
      <VerifyBanner />
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={`Previous ${unit}`}
          onClick={() => go(-1)}
          className={roundButton}
        >
          ‹
        </button>
        <h2>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setPicking(true)}
            className="flex h-11 items-center gap-2 rounded-full px-4 font-semibold active:scale-[0.96]"
          >
            {label}
            <span aria-hidden="true" className="text-sm text-muted">
              ▾
            </span>
          </button>
        </h2>
        <button
          type="button"
          aria-label={`Next ${unit}`}
          onClick={() => go(1)}
          className={roundButton}
        >
          ›
        </button>
      </div>
      <FormError message={error} />
      {!data && !error && <p className="text-muted">Loading…</p>}

      {data && (
        <section
          aria-label="Total"
          className="hero flex flex-col gap-4 rounded-[32px] p-6"
        >
          <p className="flex items-baseline justify-between">
            <span className="text-sm">Spent</span>
            <span className="text-4xl font-semibold">
              {formatCents(data.summary.totalCents)}
            </span>
          </p>
        </section>
      )}
      {data && data.summary.byCategory.length > 0 && (
        <SpendChart period={period} summary={data.summary} />
      )}

      <Link to={`/expenses/new?month=${addMonth}`} className={primaryButton}>
        + Add expense
      </Link>

      {data?.list.totalCount === 0 && (
        <p className="text-muted">
          Nothing spent in {label} yet. Add an expense, or lock a split bill and
          your share appears here.
        </p>
      )}
      {data && data.list.totalCount > data.list.items.length && (
        <p className="text-sm text-muted">
          Showing the newest {data.list.items.length} of {data.list.totalCount}.
        </p>
      )}

      {days.map(([day, expenses]) => (
        <section key={day} className="flex flex-col gap-2">
          <SectionLabel count={expenses.length}>{dayLabel(day)}</SectionLabel>
          <ul className="flex flex-col gap-2">
            {expenses.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setEditing(e)}
                  className={row}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-raised text-xl"
                  >
                    {CATEGORIES[e.category].icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {e.merchant || CATEGORIES[e.category].label}
                    </span>
                    <span className="text-sm text-muted">
                      {SOURCE_LABELS[e.source]}
                    </span>
                  </span>
                  <span className="font-semibold">
                    {formatCents(e.amountCents)}
                  </span>
                  <span aria-hidden="true" className="text-muted">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {picking && (
        <RangePicker
          period={period}
          onPick={show}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && (
        <EditExpense
          expense={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </Page>
  );
}

// The list comes newest first, so days come out newest first too
function byDay(expenses: Expense[]): [string, Expense[]][] {
  const days = new Map<string, Expense[]>();
  for (const e of expenses) {
    const day = sgDay(e.spentAt);
    days.set(day, [...(days.get(day) ?? []), e]);
  }
  return [...days];
}
