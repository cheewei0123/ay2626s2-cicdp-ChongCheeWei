import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { validateNewPassword } from './validation';

const ok = (body: unknown, status = 200) => ({ status, body });
const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: '2026-11-20T00:00:00Z',
  paynowMobile: null,
};
const token = () => localStorage.getItem('splitlah.token');
const posted = (calls: unknown[][], url: string) =>
  JSON.parse(
    (calls.find(([u]) => u === url)![1] as RequestInit).body as string,
  );

describe('validateNewPassword (KAN-90)', () => {
  it('needs 8 to 128 characters, typed the same twice', () => {
    expect(
      validateNewPassword({ password: 'long enough', confirm: 'long enough' }),
    ).toEqual({});
    expect(
      validateNewPassword({ password: 'short', confirm: 'short' }),
    ).toEqual({
      password: 'At least 8 characters',
    });
    const long = 'x'.repeat(129);
    expect(validateNewPassword({ password: long, confirm: long })).toEqual({
      password: 'At most 128 characters',
    });
    expect(
      validateNewPassword({ password: 'long enough', confirm: 'long enougj' }),
    ).toEqual({
      confirm: 'The two passwords are different',
    });
  });
});

describe('Forgot password (KAN-90)', () => {
  it('is linked from Log in, checks the email, then says a link was sent', async () => {
    const fetchMock = fakeApi({
      'POST /api/auth/forgot-password': { status: 204 },
    });
    const user = userEvent.setup();
    renderApp('/login');

    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(
      await screen.findByRole('heading', { name: 'Forgot password' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Email'), ' chee@example.com ');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If chee@example.com has an account, we have emailed it a link',
    );
    expect(posted(fetchMock.mock.calls, '/api/auth/forgot-password')).toEqual({
      email: 'chee@example.com',
    });
  });

  it('shows an error from the API (e.g. too many requests)', async () => {
    fakeApi({
      'POST /api/auth/forgot-password': ok(
        { message: 'Too many requests' },
        429,
      ),
    });
    const user = userEvent.setup();
    renderApp('/forgot-password');
    await user.type(screen.getByLabelText('Email'), 'chee@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    // The limiter's technical text is turned into plain words
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many tries',
    );
  });
});

describe('Reset password from the email link (KAN-90)', () => {
  it('sets the new password with the token from the link, then logs this browser out', async () => {
    localStorage.setItem('splitlah.token', 'old-jwt');
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      'POST /api/auth/reset-password': { status: 204 },
    });
    const user = userEvent.setup();
    renderApp('/reset-password?token=abc123');

    await user.type(
      await screen.findByLabelText('New password'),
      'brand new pass',
    );
    await user.type(screen.getByLabelText('Type it again'), 'brand new pazz');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(
      screen.getByText('The two passwords are different'),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Type it again'));
    await user.type(screen.getByLabelText('Type it again'), 'brand new pass');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(
      await screen.findByRole('heading', { name: 'Password changed' }),
    ).toBeInTheDocument();
    expect(posted(fetchMock.mock.calls, '/api/auth/reset-password')).toEqual({
      token: 'abc123',
      password: 'brand new pass',
    });
    expect(token()).toBeNull();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('explains an expired link', async () => {
    fakeApi({
      'POST /api/auth/reset-password': ok(
        { message: 'This link is invalid or has expired. Ask for a new one.' },
        400,
      ),
    });
    const user = userEvent.setup();
    renderApp('/reset-password?token=old');
    await user.type(screen.getByLabelText('New password'), 'brand new pass');
    await user.type(screen.getByLabelText('Type it again'), 'brand new pass');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invalid or has expired',
    );
  });
});

describe('Change password from Profile (KAN-90)', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  it('needs the current password, then keeps you logged in with a new token', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      'POST /api/me/password': ok({ user: chee, accessToken: 'jwt-2' }),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    await user.click(
      await screen.findByRole('link', { name: 'Change password' }),
    );
    await user.type(
      await screen.findByLabelText('New password'),
      'brand new pass',
    );
    await user.type(screen.getByLabelText('Type it again'), 'brand new pass');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Enter your current password')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Current password'), 'old password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password changed ✓',
    );
    expect(posted(fetchMock.mock.calls, '/api/me/password')).toEqual({
      currentPassword: 'old password',
      newPassword: 'brand new pass',
    });
    expect(token()).toBe('jwt-2');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('shows a wrong current password', async () => {
    fakeApi({
      'GET /api/me': ok(chee),
      'POST /api/me/password': ok(
        { message: 'Your current password is wrong' },
        403,
      ),
    });
    const user = userEvent.setup();
    renderApp('/profile/password');
    await user.type(await screen.findByLabelText('Current password'), 'guess');
    await user.type(screen.getByLabelText('New password'), 'brand new pass');
    await user.type(screen.getByLabelText('Type it again'), 'brand new pass');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your current password is wrong',
    );
    expect(token()).toBe('jwt-1');
  });
});
