import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';

const ok = (body?: unknown, status = 200) => ({ status, body });
const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: null as string | null,
  paynowMobile: '+6591234567',
};
const verified = { ...chee, emailVerifiedAt: '2026-11-22T03:00:00.000Z' };
const banner = () =>
  screen.queryByRole('region', { name: 'Verify your email' });
const token = 'a'.repeat(43);

describe('Verify banner on the home screens', () => {
  afterEach(() => localStorage.clear());

  it('tells an unverified user why, and sends a new link on "Send again"', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      'GET /api/bills': ok([]),
      'POST /api/auth/resend-verification': ok(undefined, 204),
    });
    const user = userEvent.setup();
    renderApp('/bills');

    expect(await screen.findByText('chee@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send again' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sent. Check your inbox',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/resend-verification',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows the API answer when asking too often', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    fakeApi({
      'GET /api/me': ok(chee),
      'GET /api/bills': ok([]),
      'POST /api/auth/resend-verification': ok(
        { message: 'Too many requests. Wait a minute and try again.' },
        429,
      ),
    });
    const user = userEvent.setup();
    renderApp('/bills');

    await user.click(await screen.findByRole('button', { name: 'Send again' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Too many');
  });

  it('is gone once the email is verified', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    fakeApi({ 'GET /api/me': ok(verified), 'GET /api/bills': ok([]) });
    renderApp('/bills');
    expect(
      await screen.findByText('Hi Chee! You have no bills yet.'),
    ).toBeInTheDocument();
    expect(banner()).toBeNull();
  });
});

describe('/verify (the link in the email)', () => {
  afterEach(() => localStorage.clear());

  it('verifies a logged-out visitor and sends them to log in', async () => {
    const fetchMock = fakeApi({
      'POST /api/auth/verify-email': ok(undefined, 204),
    });
    renderApp(`/verify?token=${token}`);

    expect(
      await screen.findByText(/Your email is verified/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      token,
    });
  });

  it('refreshes a logged-in user so the banner goes away', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    // The API says "verified" only after the link is opened
    let isVerified = false;
    let finishVerify!: (reply: { status: number }) => void;
    const fetchMock = fakeApi({
      get 'GET /api/me'() {
        return ok(isVerified ? verified : chee);
      },
      'POST /api/auth/verify-email': new Promise(
        (done) => (finishVerify = done),
      ),
      'GET /api/bills': ok([]),
    });
    const user = userEvent.setup();
    renderApp(`/verify?token=${token}`);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.anything()),
    );
    isVerified = true;
    finishVerify({ status: 204 });

    await user.click(
      await screen.findByRole('link', { name: 'Go to my bills' }),
    );
    expect(
      await screen.findByText('Hi Chee! You have no bills yet.'),
    ).toBeInTheDocument();
    expect(banner()).toBeNull();
  });

  it('explains a used or expired link', async () => {
    fakeApi({
      'POST /api/auth/verify-email': ok(
        {
          message:
            'This link is invalid or has expired. Log in and ask for a new one.',
        },
        400,
      ),
    });
    renderApp(`/verify?token=${token}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invalid or has expired',
    );
    expect(screen.queryByText(/Your email is verified/)).toBeNull();
  });
});
