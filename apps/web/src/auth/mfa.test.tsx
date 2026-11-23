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
  paynowMobile: '+6591234567',
  phoneVerifiedAt: '2026-11-23T02:00:00.000Z',
  mfaEnabledAt: null as string | null,
};
const methods = {
  'GET /api/me/phone/methods': ok({ telegram: false, sms: true }),
};
const bodyOf = (calls: unknown[][], url: string) =>
  JSON.parse(
    (calls.find(([u]) => u === url)![1] as RequestInit).body as string,
  );

describe('Logging in with two-step login on (KAN-92)', () => {
  beforeEach(() => localStorage.clear());

  async function passwordStep() {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(screen.getByLabelText('Email'), 'chee@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByLabelText('Code');
    return user;
  }

  it('asks for the app code after the password, then logs in', async () => {
    const fetchMock = fakeApi({
      'POST /api/auth/login': ok({ mfaRequired: true, mfaToken: 'half' }),
      'POST /api/auth/mfa': ok({ user: chee, accessToken: 'jwt-2' }),
      'GET /api/bills': ok([]),
    });
    const user = await passwordStep();
    // No login yet: only the half-way token, which is never saved
    expect(localStorage.getItem('splitlah.token')).toBeNull();

    await user.type(screen.getByLabelText('Code'), '12');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      screen.getByText('Type the 6 digits from your app, or a backup code'),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Code'));
    await user.type(screen.getByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      await screen.findByRole('heading', { name: 'My bills' }),
    ).toBeInTheDocument();
    expect(bodyOf(fetchMock.mock.calls, '/api/auth/mfa')).toEqual({
      mfaToken: 'half',
      code: '123456',
    });
    expect(localStorage.getItem('splitlah.token')).toBe('jwt-2');
  });

  it('takes a backup code, shows a wrong code, and can start again', async () => {
    const fetchMock = fakeApi({
      'POST /api/auth/login': ok({ mfaRequired: true, mfaToken: 'half' }),
      'POST /api/auth/mfa': ok({ message: 'That code is not right' }, 401),
    });
    const user = await passwordStep();
    expect(
      screen.getByText(
        'Lost your phone? Type one of your backup codes instead.',
      ),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Code'), 'abcd-efgh');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is not right',
    );
    expect(bodyOf(fetchMock.mock.calls, '/api/auth/mfa').code).toBe(
      'abcd-efgh',
    );

    await user.click(screen.getByRole('button', { name: 'Start again' }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Profile: two-step login (KAN-92)', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  const section = async () =>
    screen.findByRole('region', { name: 'Two-step login' });

  it('turns on: password, scan the QR, first code, then the backup codes once', async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `abc${i}-defg`);
    const replies = {
      ...methods,
      'GET /api/me': ok(chee),
      'GET /api/me/mfa': ok({ on: false, backupCodesLeft: 0 }),
      'POST /api/me/mfa/setup': ok({
        secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/SplitLah%3Achee?secret=JBSW',
      }),
      'POST /api/me/mfa/enable': ok({ backupCodes: codes }),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/profile');

    const box = await section();
    expect(await within(box).findByText('Off')).toBeVisible();
    await user.click(within(box).getByRole('button', { name: 'Turn on' }));
    await user.click(within(box).getByRole('button', { name: 'Continue' }));
    expect(within(box).getByText('Type your password')).toBeVisible();
    await user.type(within(box).getByLabelText('Password'), 'correct horse');
    await user.click(within(box).getByRole('button', { name: 'Continue' }));

    expect(
      await within(box).findByTitle(
        'QR code to add SplitLah to your authenticator app',
      ),
    ).toBeInTheDocument();
    expect(
      within(box).getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
    ).toBeVisible();
    expect(bodyOf(fetchMock.mock.calls, '/api/me/mfa/setup')).toEqual({
      password: 'correct horse',
    });

    await user.click(within(box).getByRole('button', { name: 'Turn on' }));
    expect(
      within(box).getByText('Type the 6 digits from your app'),
    ).toBeVisible();
    await user.type(
      within(box).getByLabelText('6-digit code from the app'),
      '12a3456',
    );
    await user.click(within(box).getByRole('button', { name: 'Turn on' }));

    const list = await within(box).findByRole('list', { name: 'Backup codes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(bodyOf(fetchMock.mock.calls, '/api/me/mfa/enable')).toEqual({
      code: '123456',
    });

    replies['GET /api/me'] = ok({ ...chee, mfaEnabledAt: '2026-11-23' });
    replies['GET /api/me/mfa'] = ok({ on: true, backupCodesLeft: 10 });
    await user.click(
      within(box).getByRole('button', { name: "I've saved them" }),
    );
    expect(await within(box).findByText('On ✓')).toBeVisible();
    expect(within(box).getByText(/10 backup codes left/)).toBeVisible();
    // Shown once: gone after saving
    expect(
      within(box).queryByRole('list', { name: 'Backup codes' }),
    ).toBeNull();
  });

  it('a wrong password is shown, and Cancel goes back', async () => {
    fakeApi({
      ...methods,
      'GET /api/me': ok(chee),
      'GET /api/me/mfa': ok({ on: false, backupCodesLeft: 0 }),
      'POST /api/me/mfa/setup': ok({ message: 'Your password is wrong' }, 403),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    const box = await section();
    await user.click(
      await within(box).findByRole('button', { name: 'Turn on' }),
    );
    await user.type(within(box).getByLabelText('Password'), 'nope');
    await user.click(within(box).getByRole('button', { name: 'Continue' }));
    expect(await within(box).findByRole('alert')).toHaveTextContent(
      'Your password is wrong',
    );
    await user.click(within(box).getByRole('button', { name: 'Cancel' }));
    expect(within(box).getByText('Off')).toBeVisible();
    expect(within(box).queryByRole('alert')).toBeNull();
  });

  it('turns off with the password and a code', async () => {
    const replies = {
      ...methods,
      'GET /api/me': ok({ ...chee, mfaEnabledAt: '2026-11-23' }),
      'GET /api/me/mfa': ok({ on: true, backupCodesLeft: 1 }),
      'POST /api/me/mfa/disable': ok(chee),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/profile');

    const box = await section();
    expect(await within(box).findByText(/1 backup code left/)).toBeVisible();
    await user.click(within(box).getByRole('button', { name: 'Turn off' }));
    await user.click(within(box).getByRole('button', { name: 'Turn off' }));
    expect(
      within(box).getByText('Type your password and a code'),
    ).toBeVisible();

    await user.type(within(box).getByLabelText('Password'), 'correct horse');
    await user.type(
      within(box).getByLabelText('Code from your app, or a backup code'),
      ' 654321 ',
    );
    replies['GET /api/me'] = ok(chee);
    replies['GET /api/me/mfa'] = ok({ on: false, backupCodesLeft: 0 });
    await user.click(within(box).getByRole('button', { name: 'Turn off' }));

    expect(await within(box).findByText('Off')).toBeVisible();
    expect(bodyOf(fetchMock.mock.calls, '/api/me/mfa/disable')).toEqual({
      password: 'correct horse',
      code: '654321',
    });
  });
});
