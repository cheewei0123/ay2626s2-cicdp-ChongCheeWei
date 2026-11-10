import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { useAuth } from './context';

const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: null,
  paynowMobile: null,
};
const loggedIn = { status: 200, body: { user: chee, accessToken: 'jwt-1' } };

const token = () => localStorage.getItem('splitlah.token');
const logInButton = () => screen.findByRole('button', { name: 'Log in' });

describe('Register', () => {
  it('registers, logs you in and lands on My bills', async () => {
    const fetchMock = fakeApi({
      'POST /api/auth/register': { ...loggedIn, status: 201 },
    });
    const user = userEvent.setup();
    const router = renderApp('/register');

    await user.type(screen.getByLabelText('Name'), '  Chee ');
    await user.type(screen.getByLabelText('Email'), 'chee@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByRole('heading', { name: 'My bills' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Hi Chee! You have no bills yet.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bills');
    expect(token()).toBe('jwt-1');
    // Name trimmed, and no empty PayNow number sent
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toEqual({
      displayName: 'Chee',
      email: 'chee@example.com',
      password: 'correct horse',
    });
  });

  it('shows what is wrong next to each field and sends nothing', async () => {
    const fetchMock = fakeApi({});
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(
      screen.getByLabelText('PayNow number (optional)'),
      '12345678',
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      screen.getByText('Enter a name (up to 50 characters)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(
      screen.getByText('A Singapore mobile like +6591234567'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the API error in words, not JSON', async () => {
    fakeApi({
      'POST /api/auth/register': {
        status: 409,
        body: {
          statusCode: 409,
          error: 'Conflict',
          message: 'Email is already registered',
        },
      },
    });
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(screen.getByLabelText('Name'), 'Chee');
    await user.type(screen.getByLabelText('Email'), 'chee@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.type(
      screen.getByLabelText('PayNow number (optional)'),
      '+6591234567',
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email is already registered',
    );
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeEnabled();
    expect(token()).toBeNull();
  });

  it('sends you to My bills if you are already logged in', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    fakeApi({ 'GET /api/me': { status: 200, body: chee } });
    const router = renderApp('/register');
    expect(
      await screen.findByRole('heading', { name: 'My bills' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bills');
  });
});

describe('Log in', () => {
  it('logs in and goes to My bills', async () => {
    fakeApi({ 'POST /api/auth/login': loggedIn });
    const user = userEvent.setup();
    const router = renderApp('/login');

    await user.type(screen.getByLabelText('Email'), 'chee@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(await logInButton());

    expect(
      await screen.findByRole('heading', { name: 'My bills' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bills');
    expect(token()).toBe('jwt-1');
  });

  it('sends you to log in first, then back to the page you opened', async () => {
    fakeApi({ 'POST /api/auth/login': loggedIn });
    const user = userEvent.setup();
    const router = renderApp('/bills');

    expect(await logInButton()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    await user.type(screen.getByLabelText('Email'), 'chee@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(await logInButton());

    expect(
      await screen.findByRole('heading', { name: 'My bills' }),
    ).toBeInTheDocument();
  });

  it('shows a wrong password nicely and stays logged out', async () => {
    fakeApi({
      'POST /api/auth/login': {
        status: 401,
        body: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password',
        },
      },
    });
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(screen.getByLabelText('Email'), 'chee@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(await logInButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    );
    expect(token()).toBeNull();
  });

  it('checks the form before sending', async () => {
    const fetchMock = fakeApi({});
    const user = userEvent.setup();
    renderApp('/login');

    await user.click(await logInButton());

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows that it is working while the API answers', async () => {
    fakeApi({ 'POST /api/auth/login': new Promise(() => {}) }); // never answers
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(screen.getByLabelText('Email'), 'chee@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(await logInButton());

    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
  });
});

describe('Staying logged in', () => {
  it('a refresh keeps you logged in (the saved token is checked with GET /me)', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    const fetchMock = fakeApi({ 'GET /api/me': { status: 200, body: chee } });
    renderApp('/bills');

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(
      await screen.findByText('Hi Chee! You have no bills yet.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Authorization: 'Bearer jwt-1',
    });
  });

  it('an expired token sends you to log in and is removed', async () => {
    localStorage.setItem('splitlah.token', 'expired-jwt');
    fakeApi({
      'GET /api/me': {
        status: 401,
        body: { statusCode: 401, message: 'Unauthorized' },
      },
    });
    renderApp('/bills');

    expect(await logInButton()).toBeInTheDocument();
    expect(token()).toBeNull();
  });

  it('log out clears the token and goes back to log in', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    fakeApi({ 'GET /api/me': { status: 200, body: chee } });
    const user = userEvent.setup();
    renderApp('/bills');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await logInButton()).toBeInTheDocument();
    expect(token()).toBeNull();
  });
});

describe('Other pages', () => {
  it('a shared bill link opens without logging in', async () => {
    const fetchMock = fakeApi({});
    renderApp('/s/abc123');
    expect(
      await screen.findByText('Opening shared bills is coming soon.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an unknown address goes to My bills (or log in)', async () => {
    fakeApi({});
    const router = renderApp('/nowhere');
    expect(await logInButton()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('useAuth outside <AuthProvider> is a programming mistake and says so', () => {
    function Broken() {
      useAuth();
      return null;
    }
    expect(() => render(<Broken />)).toThrow(
      'useAuth must be used inside <AuthProvider>',
    );
  });
});
