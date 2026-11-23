import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { formatCents } from '../bills/money';
import type { Bill } from '../bills/types';
import { FormError } from '../components/FormError';
import { HomeTabs } from '../components/HomeTabs';
import { VerifyBanner } from '../components/VerifyBanner';
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
  const { user } = useAuth();
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
            {/* An open bill can still be edited; a locked one opens its summary */}
            <Link
              to={`/bills/${bill.id}/${bill.status === 'OPEN' ? 'edit' : 'summary'}`}
              className={row}
            >
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
