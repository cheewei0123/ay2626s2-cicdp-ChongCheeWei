import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';

const ok = (body: unknown, status = 200) => ({ status, body });
const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: '2026-11-01T00:00:00.000Z',
  paynowMobile: null,
  phoneVerifiedAt: null,
  mfaEnabledAt: null as string | null,
};
const others = {
  'GET /api/me/phone/methods': ok({ telegram: false, sms: true }),
  'GET /api/me/mfa': ok({ on: false, backupCodesLeft: 0 }),
};
const bodyOf = (calls: unknown[][]) =>
  JSON.parse(
    (
      calls.find(
        ([u, init]) =>
          u === '/api/me' && (init as RequestInit)?.method === 'DELETE',
      )![1] as RequestInit
    ).body as string,
  );

describe('Profile: delete account (KAN-93)', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  async function openIt(user = chee) {
    const fetchMock = fakeApi({
      ...others,
      'GET /api/me': ok(user),
      'DELETE /api/me': { status: 204, body: undefined },
    });
    const ui = userEvent.setup();
    renderApp('/profile');
    const box = await screen.findByRole('region', { name: 'Delete account' });
    await ui.click(within(box).getByRole('button', { name: 'Delete account' }));
    return { fetchMock, ui, box };
  }

  it('says what happens, needs the password, then logs out with a notice', async () => {
    const { fetchMock, ui, box } = await openIt();
    expect(
      within(box).getByText(/kept for 6 months, then wiped for good/),
    ).toBeVisible();
    expect(
      within(box).queryByLabelText('Code from your app, or a backup code'),
    ).toBeNull();

    await ui.click(
      within(box).getByRole('button', { name: 'Delete my account' }),
    );
    expect(within(box).getByText('Type your password')).toBeVisible();

    await ui.type(within(box).getByLabelText('Password'), 'correct horse');
    await ui.click(
      within(box).getByRole('button', { name: 'Delete my account' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your account is deleted.',
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(localStorage.getItem('splitlah.token')).toBeNull();
    expect(bodyOf(fetchMock.mock.calls)).toEqual({ password: 'correct horse' });
  });

  it('with two-step login on, also asks for a code', async () => {
    const { fetchMock, ui, box } = await openIt({
      ...chee,
      mfaEnabledAt: '2026-11-23T00:00:00.000Z',
    });
    await ui.type(within(box).getByLabelText('Password'), 'correct horse');
    await ui.click(
      within(box).getByRole('button', { name: 'Delete my account' }),
    );
    expect(
      within(box).getByText('Type your password and a code'),
    ).toBeVisible();

    await ui.type(
      within(box).getByLabelText('Code from your app, or a backup code'),
      ' 123456 ',
    );
    await ui.click(
      within(box).getByRole('button', { name: 'Delete my account' }),
    );
    expect(await screen.findByText('Your account is deleted.')).toBeVisible();
    expect(bodyOf(fetchMock.mock.calls)).toEqual({
      password: 'correct horse',
      code: '123456',
    });
  });

  it('a wrong password is shown and keeps you logged in; Cancel closes it', async () => {
    fakeApi({
      ...others,
      'GET /api/me': ok(chee),
      'DELETE /api/me': ok({ message: 'Your password is wrong' }, 403),
    });
    const ui = userEvent.setup();
    renderApp('/profile');
    const box = await screen.findByRole('region', { name: 'Delete account' });
    await ui.click(within(box).getByRole('button', { name: 'Delete account' }));
    await ui.type(within(box).getByLabelText('Password'), 'nope');
    await ui.click(
      within(box).getByRole('button', { name: 'Delete my account' }),
    );

    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Your password is wrong',
    );
    expect(localStorage.getItem('splitlah.token')).toBe('jwt-1');
    expect(
      within(box).getByRole('button', { name: 'Delete my account' }),
    ).toBeEnabled();

    await ui.click(within(box).getByRole('button', { name: 'Cancel' }));
    expect(
      within(box).getByRole('button', { name: 'Delete account' }),
    ).toBeVisible();
    expect(within(box).queryByRole('alert')).toBeNull();
  });
});
