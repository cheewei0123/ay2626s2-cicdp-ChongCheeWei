import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { validateProfile } from './validation';

const ok = (body: unknown, status = 200) => ({ status, body });
const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: '2026-11-01T00:00:00.000Z',
  paynowMobile: null as string | null,
  phoneVerifiedAt: null as string | null,
};
const unchecked = { ...chee, paynowMobile: '+6591234567' };
const checked = { ...unchecked, phoneVerifiedAt: '2026-11-23T02:00:00.000Z' };

// The JSON body of the first `method` request to `url`
const sent = (calls: unknown[][], method: string, url: string) =>
  JSON.parse(
    (
      calls.find(
        ([u, init]) =>
          u === url && (init as RequestInit | undefined)?.method === method,
      )![1] as RequestInit
    ).body as string,
  );
const called = (calls: unknown[][], method: string, url: string) =>
  calls.some(
    ([u, init]) =>
      u === url && (init as RequestInit | undefined)?.method === method,
  );

beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));
afterEach(() => vi.useRealTimers());

describe('My bills: asking for a checked PayNow number', () => {
  it.each([
    [chee, /Add your PayNow number so friends can pay you back/],
    [unchecked, /Check your PayNow number so friends can pay you back/],
  ])('asks, and links to Profile', async (me, text) => {
    fakeApi({ 'GET /api/me': ok(me), 'GET /api/bills': ok([]) });
    renderApp('/bills');
    expect(await screen.findByRole('link', { name: text })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('stops asking once the number is checked', async () => {
    fakeApi({ 'GET /api/me': ok(checked), 'GET /api/bills': ok([]) });
    renderApp('/bills');
    expect(
      await screen.findByRole('heading', { name: 'My bills' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PayNow number so friends/)).toBeNull();
  });
});

describe('Profile: the name', () => {
  it('saves only the name', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok(checked),
      'PATCH /api/me': ok({ ...checked, displayName: 'Chee Wei' }),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    expect(await screen.findByText('chee@example.com')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Chee Wei');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Saved ✓');
    expect(sent(fetchMock.mock.calls, 'PATCH', '/api/me')).toEqual({
      displayName: 'Chee Wei',
    });
  });

  it('needs a name, and shows API errors', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok(checked),
      'PATCH /api/me': ok({ message: 'Something went wrong' }, 500),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    await user.clear(await screen.findByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(
      screen.getByText('Enter a name (up to 50 characters)'),
    ).toBeInTheDocument();
    expect(called(fetchMock.mock.calls, 'PATCH', '/api/me')).toBe(false);

    await user.type(screen.getByLabelText('Name'), 'Chee');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    );
  });
});

describe('Profile: checking the PayNow number by SMS (KAN-91)', () => {
  it('adds a number: texts a code, then the right code checks it', async () => {
    const replies = {
      'GET /api/me': ok(chee),
      'POST /api/me/phone': ok({
        phone: '+6591234567',
        expiresAt: '2026-11-23T02:10:00.000Z',
      }),
      'POST /api/me/phone/verify': ok(checked),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/profile');

    const section = await screen.findByRole('region', {
      name: 'PayNow number',
    });
    // A typo is caught on the phone, before any SMS is paid for
    await user.type(within(section).getByLabelText('Mobile number'), '1234');
    await user.click(
      within(section).getByRole('button', { name: 'Text me a code' }),
    );
    expect(
      within(section).getByText('8 digits, starting with 8 or 9'),
    ).toBeInTheDocument();
    expect(called(fetchMock.mock.calls, 'POST', '/api/me/phone')).toBe(false);

    await user.clear(within(section).getByLabelText('Mobile number'));
    await user.type(
      within(section).getByLabelText('Mobile number'),
      '9123 4567',
    );
    await user.click(
      within(section).getByRole('button', { name: 'Text me a code' }),
    );
    expect(
      await within(section).findByText(/We texted a code to \+65 9123 4567/),
    ).toBeInTheDocument();
    expect(sent(fetchMock.mock.calls, 'POST', '/api/me/phone')).toEqual({
      phone: '+6591234567',
    });
    expect(
      within(section).getByRole('button', { name: 'New code in 60s' }),
    ).toBeDisabled();

    await user.type(within(section).getByLabelText('6-digit code'), '12a3');
    await user.click(
      within(section).getByRole('button', { name: 'Check code' }),
    );
    expect(
      within(section).getByText('Type the 6 digits from the SMS'),
    ).toBeInTheDocument();

    await user.type(within(section).getByLabelText('6-digit code'), '456');
    replies['GET /api/me'] = ok(checked); // what refreshUser gets back
    await user.click(
      within(section).getByRole('button', { name: 'Check code' }),
    );
    expect(await within(section).findByText('Checked ✓')).toBeVisible();
    expect(sent(fetchMock.mock.calls, 'POST', '/api/me/phone/verify')).toEqual({
      code: '123456',
    });
    expect(within(section).getByText('+65 9123 4567')).toBeVisible();
  });

  it('a number from sign-up says it is not checked, and can be checked', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok(unchecked),
      'POST /api/me/phone': ok({ phone: '+6591234567', expiresAt: 'x' }),
      'POST /api/me/phone/verify': ok(
        { message: 'Wrong code. 4 tries left.' },
        400,
      ),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    const section = await screen.findByRole('region', {
      name: 'PayNow number',
    });
    expect(within(section).getByText('Not checked')).toBeVisible();
    expect(
      within(section).getByText(/Friends can't pay you by PayNow QR/),
    ).toBeVisible();
    await user.click(
      within(section).getByRole('button', { name: 'Text me a code' }),
    );
    expect(sent(fetchMock.mock.calls, 'POST', '/api/me/phone')).toEqual({
      phone: '+6591234567',
    });

    await user.type(
      await within(section).findByLabelText('6-digit code'),
      '000000',
    );
    await user.click(
      within(section).getByRole('button', { name: 'Check code' }),
    );
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Wrong code. 4 tries left.',
    );

    // Cancel goes back to the number as it was
    await user.click(within(section).getByRole('button', { name: 'Cancel' }));
    expect(within(section).getByText('Not checked')).toBeVisible();
  });

  it('a new code can be asked for once the minute is up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = fakeApi({
      'GET /api/me': ok(unchecked),
      'POST /api/me/phone': ok({ phone: '+6591234567', expiresAt: 'x' }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/profile');

    await user.click(
      await screen.findByRole('button', { name: 'Text me a code' }),
    );
    expect(
      await screen.findByRole('button', { name: 'New code in 60s' }),
    ).toBeDisabled();
    for (let i = 0; i < 60; i++) await act(() => vi.advanceTimersByTime(1000));

    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(
      fetchMock.mock.calls.filter(([u]) => u === '/api/me/phone'),
    ).toHaveLength(2);
  });

  it('a checked number can be changed (the old one stays meanwhile) or removed', async () => {
    const replies = {
      'GET /api/me': ok(checked),
      'POST /api/me/phone': ok(
        {
          message:
            'The code could not be sent. Check the number and try again.',
        },
        503,
      ),
      'DELETE /api/me/phone': ok(chee),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/profile');

    const section = await screen.findByRole('region', {
      name: 'PayNow number',
    });
    expect(within(section).getByText('Checked ✓')).toBeVisible();
    expect(
      within(section).queryByRole('button', { name: 'Text me a code' }),
    ).toBeNull();

    await user.click(
      within(section).getByRole('button', { name: 'Change number' }),
    );
    expect(
      within(section).getByText(
        'Your old number +65 9123 4567 stays until the new one is checked.',
      ),
    ).toBeVisible();
    await user.type(
      within(section).getByLabelText('Mobile number'),
      '98765432',
    );
    await user.click(
      within(section).getByRole('button', { name: 'Text me a code' }),
    );
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'The code could not be sent. Check the number and try again.',
    );
    await user.click(within(section).getByRole('button', { name: 'Cancel' }));

    replies['GET /api/me'] = ok(chee);
    await user.click(within(section).getByRole('button', { name: 'Remove' }));
    expect(await within(section).findByLabelText('Mobile number')).toHaveValue(
      '',
    );
    expect(called(fetchMock.mock.calls, 'DELETE', '/api/me/phone')).toBe(true);
    // With no number there is nothing to cancel back to
    expect(
      within(section).queryByRole('button', { name: 'Cancel' }),
    ).toBeNull();
  });
});

describe('Profile: checking the PayNow number with Telegram (KAN-91)', () => {
  const both = ok({ telegram: true, sms: true });

  it('opens the bot with a one-time link, then shows Checked ✓ by itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const url = 'https://t.me/SplitLahBot?start=abc';
    const replies = {
      'GET /api/me': ok(chee),
      'GET /api/me/phone/methods': both,
      'POST /api/me/phone/telegram': ok({ phone: '+6591234567', url }),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/profile');

    const section = await screen.findByRole('region', {
      name: 'PayNow number',
    });
    await user.type(
      within(section).getByLabelText('Mobile number'),
      '91234567',
    );
    await user.click(
      await within(section).findByRole('button', {
        name: 'Check with Telegram',
      }),
    );
    const open = await within(section).findByRole('link', {
      name: 'Open Telegram',
    });
    expect(open).toHaveAttribute('href', url);
    expect(open).toHaveAttribute('target', '_blank');
    expect(
      sent(fetchMock.mock.calls, 'POST', '/api/me/phone/telegram'),
    ).toEqual({ phone: '+6591234567' });
    expect(within(section).getByRole('status')).toHaveTextContent(
      'Waiting for Telegram',
    );

    // The bot checks the number; the next poll sees it
    replies['GET /api/me'] = ok(checked);
    await act(() => vi.advanceTimersByTime(3000));
    expect(await within(section).findByText('Checked ✓')).toBeVisible();
  });

  it('keeps SMS as the other way, and Cancel leaves the waiting step', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok(unchecked),
      'GET /api/me/phone/methods': both,
      'POST /api/me/phone/telegram': ok({ phone: '+6591234567', url: 'x' }),
      'POST /api/me/phone': ok({ phone: '+6598765432', expiresAt: 'x' }),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    const section = await screen.findByRole('region', {
      name: 'PayNow number',
    });
    await user.click(
      await within(section).findByRole('button', {
        name: 'Check with Telegram',
      }),
    );
    await user.click(
      await within(section).findByRole('button', { name: 'Cancel' }),
    );
    expect(within(section).getByText('Not checked')).toBeVisible();

    await user.click(
      within(section).getByRole('button', { name: 'Change number' }),
    );
    // A typo is still caught before anything is sent
    await user.click(
      within(section).getByRole('button', {
        name: 'No Telegram? Text me a code',
      }),
    );
    expect(
      within(section).getByText('8 digits, starting with 8 or 9'),
    ).toBeInTheDocument();
    await user.type(
      within(section).getByLabelText('Mobile number'),
      '98765432',
    );
    await user.click(
      within(section).getByRole('button', {
        name: 'No Telegram? Text me a code',
      }),
    );
    expect(
      await within(section).findByText(/We texted a code to \+65 9876 5432/),
    ).toBeInTheDocument();
    expect(sent(fetchMock.mock.calls, 'POST', '/api/me/phone')).toEqual({
      phone: '+6598765432',
    });
  });

  it('hides SMS on a server that cannot text, and says so when nothing works', async () => {
    fakeApi({
      'GET /api/me': ok(unchecked),
      'GET /api/me/phone/methods': ok({ telegram: true, sms: false }),
    });
    renderApp('/profile');
    const section = await screen.findByRole('region', {
      name: 'PayNow number',
    });
    expect(
      await within(section).findByRole('button', {
        name: 'Check with Telegram',
      }),
    ).toBeVisible();
    expect(
      within(section).queryByRole('button', { name: 'Text me a code' }),
    ).toBeNull();
  });

  it('says so when neither way is set up', async () => {
    fakeApi({
      'GET /api/me': ok(chee),
      'GET /api/me/phone/methods': ok({ telegram: false, sms: false }),
    });
    renderApp('/profile');
    expect(
      await screen.findByText(
        "Checking numbers isn't set up on this server yet.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Text me a code' }),
    ).toBeDisabled();
  });
});

describe('validateProfile', () => {
  it('needs a name of 1 to 50 characters', () => {
    expect(validateProfile({ displayName: 'Chee' })).toEqual({});
    expect(validateProfile({ displayName: ' ' })).toEqual({
      displayName: 'Enter a name (up to 50 characters)',
    });
  });
});
