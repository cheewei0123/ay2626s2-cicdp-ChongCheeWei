import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { formatCents } from '../bills/money';
import type { Bill } from '../bills/types';
import { FormError } from '../components/FormError';
import {
  Initial,
  Page,
  primaryButton,
  row,
  SectionLabel,
  smallButton,
} from '../components/Page';

// Wireframe #5: my bills, newest first, and a button to start a new one
export default function MyBills() {
  const { user, logout } = useAuth();
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Bill[]>('/bills')
      .then(setBills)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <Page
      title="My bills"
      action={
        <button type="button" onClick={logout} className={smallButton}>
          Log out
        </button>
      }
    >
      <Link to="/bills/new" className={primaryButton}>
        + New bill
      </Link>
      <FormError message={error} />
      {bills?.length === 0 && (
        <p className="text-muted">
          Hi {user?.displayName}! You have no bills yet.
        </p>
      )}
      {bills && bills.length > 0 && (
        <SectionLabel count={bills.length}>Bills</SectionLabel>
      )}
      <ul className="flex flex-col gap-2">
        {bills?.map((bill) => (
          <li key={bill.id}>
            <Link to={`/bills/${bill.id}/edit`} className={row}>
              <Initial of={bill.title} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{bill.title}</span>
                <span className="text-sm text-muted">{bill.status}</span>
              </span>
              <span className="font-semibold">
                {formatCents(bill.totals.totalCents)}
              </span>
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
