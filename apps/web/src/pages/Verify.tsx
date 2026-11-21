import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { useAuth } from '../auth/context';
import { FormError } from '../components/FormError';
import { Page, primaryButton } from '../components/Page';

// Opened from the link in the verify email: /verify?token=...
// Public, because the link may open in a browser where you are not logged in.
export default function Verify() {
  const [params] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const sent = useRef(false);

  useEffect(() => {
    // A token works once, so never send it twice (React runs effects twice in dev)
    if (sent.current) return;
    sent.current = true;
    api('/auth/verify-email', {
      method: 'POST',
      body: { token: params.get('token') ?? '' },
    })
      .then(() => setDone(true))
      .catch((err: Error) => setError(err.message));
  }, [params]);

  // Logged in here too: fetch the user again so the banner goes away
  useEffect(() => {
    if (done && user && !user.emailVerifiedAt) {
      refreshUser().catch(() => undefined);
    }
  }, [done, user, refreshUser]);

  return (
    <Page title="Verify your email">
      {!done && !error && <p className="text-muted">Checking the link…</p>}
      {done && (
        <p className="text-muted">
          Your email is verified. You can start bills and log expenses now.
        </p>
      )}
      <FormError message={error} />
      {(done || error) && (
        <Link to={user ? '/bills' : '/login'} className={primaryButton}>
          {user ? 'Go to my bills' : 'Log in'}
        </Link>
      )}
    </Page>
  );
}
