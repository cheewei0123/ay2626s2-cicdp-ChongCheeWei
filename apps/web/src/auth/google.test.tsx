import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, renderApp, sent } from '../test-utils';

const ok = (body: unknown, status = 200) => ({ status, body });
const CLIENT_ID = '1234-abc.apps.googleusercontent.com';
const chee = {
  id: 'u1',
  email: 'chee@gmail.com',
  displayName: 'Chee',
  emailVerifiedAt: '2026-11-23T00:00:00.000Z',
  paynowMobile: null,
  phoneVerifiedAt: null,
  mfaEnabledAt: null,
  hasPassword: false,
};

// Google's script, faked: "loading" it puts window.google in place, and the test
// plays the user clicking Google's button by calling the callback with a credential
const google = {
  initialize: vi.fn(),
  renderButton: vi.fn(),
};
let failLoad = false;
const clickGoogle = (credential = 'a.b.c') =>
  google.initialize.mock.lastCall![0].callback({ credential });

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(document.head, 'append').mockImplementation((node) => {
    const script = node as HTMLScriptElement;
    expect(script.src).toBe('https://accounts.google.com/gsi/client');
    if (failLoad) return script.onerror?.(new Event('error'));
    window.google = { accounts: { id: google } };
    script.onload?.(new Event('load'));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  google.initialize.mockReset();
  google.renderButton.mockReset();
  failLoad = false;
});

describe('Continue with Google (KAN-95)', () => {
  it('stays hidden when Google cannot be loaded', async () => {
    failLoad = true;
    fakeApi({ 'GET /api/auth/google': ok({ clientId: CLIENT_ID }) });
    renderApp('/login');
    await waitFor(() => expect(document.head.append).toHaveBeenCalled());
    expect(screen.queryByText('or')).toBeNull();
    expect(google.renderButton).not.toHaveBeenCalled();
  });

  it('stays hidden, and loads nothing from Google, when the server has no client ID', async () => {
    const fetchMock = fakeApi({
      'GET /api/auth/google': ok({ clientId: null }),
    });
    renderApp('/login');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(document.head.append).not.toHaveBeenCalled();
    expect(screen.queryByText('or')).toBeNull();
  });

  it('on Log in: Google draws its button, and its credential logs you in', async () => {
    const fetchMock = fakeApi({
      'GET /api/auth/google': ok({ clientId: CLIENT_ID }),
      'POST /api/auth/google': ok({ user: chee, accessToken: 'jwt-g' }),
      'GET /api/bills': ok([]),
    });
    renderApp('/login');

    expect(await screen.findByText('or')).toBeVisible();
    expect(google.initialize.mock.lastCall![0].client_id).toBe(CLIENT_ID);
    expect(google.renderButton.mock.lastCall![1]).toMatchObject({
      theme: 'filled_black',
      text: 'continue_with',
    });

    clickGoogle('google.id.token');
    expect(
      await screen.findByRole('heading', { name: 'My bills' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('splitlah.token')).toBe('jwt-g');
    expect(JSON.parse(sent(fetchMock)[0][1]!.body as string)).toEqual({
      credential: 'google.id.token',
    });
  });

  it('on Log in: asks for the app code when two-step login is on, and shows errors', async () => {
    const replies = {
      'GET /api/auth/google': ok({ clientId: CLIENT_ID }),
      'POST /api/auth/google': ok(
        { message: 'Your Google account email is not verified' },
        401,
      ),
    };
    fakeApi(replies);
    renderApp('/login');
    await screen.findByText('or');

    clickGoogle();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your Google account email is not verified',
    );

    replies['POST /api/auth/google'] = ok({
      mfaRequired: true,
      mfaToken: 'half',
    });
    clickGoogle();
    expect(await screen.findByLabelText('Code')).toBeInTheDocument();
  });

  it('on Register: signs up and lands on My bills; with two-step login on, goes to the code step', async () => {
    const replies = {
      'GET /api/auth/google': ok({ clientId: CLIENT_ID }),
      'POST /api/auth/google': ok({ mfaRequired: true, mfaToken: 'half' }),
    };
    fakeApi(replies);
    renderApp('/register');
    await screen.findByText('or');
    clickGoogle();
    expect(await screen.findByLabelText('Code')).toBeInTheDocument();
  });

  it('on Register: an error is shown on the page', async () => {
    fakeApi({
      'GET /api/auth/google': ok({ clientId: CLIENT_ID }),
      'POST /api/auth/google': ok(
        { message: 'This account has been deleted' },
        401,
      ),
    });
    renderApp('/register');
    await screen.findByText('or');
    clickGoogle();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This account has been deleted',
    );
  });
});

describe('Profile for an account made with Google (KAN-95)', () => {
  it('offers to set a password instead of the settings that need one', async () => {
    localStorage.setItem('splitlah.token', 'jwt-g');
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      'GET /api/me/phone/methods': ok({ telegram: false, sms: true }),
      'POST /api/auth/forgot-password': { status: 204 },
    });
    const user = userEvent.setup();
    renderApp('/profile');

    const box = await screen.findByRole('region', { name: 'Password' });
    expect(within(box).getByText('You log in with Google')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Two-step login' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Delete account' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Change password' })).toBeNull();

    await user.click(
      within(box).getByRole('button', { name: 'Email me a link' }),
    );
    expect(await within(box).findByRole('status')).toHaveTextContent(
      'Check your email for the link',
    );
    expect(JSON.parse(sent(fetchMock)[0][1]!.body as string)).toEqual({
      email: 'chee@gmail.com',
    });
  });

  it('shows the error when the link cannot be sent', async () => {
    localStorage.setItem('splitlah.token', 'jwt-g');
    fakeApi({
      'GET /api/me': ok(chee),
      'GET /api/me/phone/methods': ok({ telegram: false, sms: true }),
      'POST /api/auth/forgot-password': ok(
        { message: 'Too many requests' },
        429,
      ),
    });
    const user = userEvent.setup();
    renderApp('/profile');
    const box = await screen.findByRole('region', { name: 'Password' });
    await user.click(
      within(box).getByRole('button', { name: 'Email me a link' }),
    );
    expect(await within(box).findByRole('alert')).toBeVisible();
  });
});
