import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { formatCents } from '../bills/money';
import { CategoryBars } from '../components/CategoryBars';
import { EditExpense } from '../components/EditExpense';
import { FormError } from '../components/FormError';
import { HomeTabs } from '../components/HomeTabs';
import {
  Page,
  primaryButton,
  roundButton,
  row,
  SectionLabel,
  smallButton,
} from '../components/Page';
import {
  dayLabel,
  monthLabel,
  sgDay,
  sgMonth,
  shiftMonth,
} from '../expenses/dates';
import {
  CATEGORIES,
  SOURCE_LABELS,
  type Expense,
  type ExpensePage,
  type MonthSummary,
} from '../expenses/types';

const PAGE_SIZE = 100; // the API's most per page; a month rarely has more

// Wireframe #13: what I spent this month, by category and by day
export default function Expenses() {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? sgMonth();
  const [data, setData] = useState<{
    list: ExpensePage;
    summary: MonthSummary;
  } | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api<ExpensePage>(`/expenses?month=${month}&pageSize=${PAGE_SIZE}`),
      api<MonthSummary>(`/expenses/summary?month=${month}`),
    ])
      .then(([list, summary]) => {
        setData({ list, summary });
        setError('');
      })
      .catch((err: Error) => setError(err.message));
  }, [month]);

  useEffect(load, [load]);

  const go = (by: number) => {
    setData(null);
    setParams({ month: shiftMonth(month, by) });
  };
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
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => go(-1)}
          className={roundButton}
        >
          ‹
        </button>
        <h2 className="font-semibold">{monthLabel(month)}</h2>
        <button
          type="button"
          aria-label="Next month"
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
          aria-label="Month total"
          className="hero flex flex-col gap-4 rounded-[32px] p-6"
        >
          <p className="flex items-baseline justify-between">
            <span className="text-sm">Spent</span>
            <span className="text-4xl font-semibold">
              {formatCents(data.summary.totalCents)}
            </span>
          </p>
          {data.summary.byCategory.length > 0 && (
            <CategoryBars summary={data.summary} />
          )}
        </section>
      )}

      <Link to={`/expenses/new?month=${month}`} className={primaryButton}>
        + Add expense
      </Link>

      {data?.list.totalCount === 0 && (
        <p className="text-muted">
          Nothing spent in {monthLabel(month)} yet. Add an expense, or lock a
          split bill and your share appears here.
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
