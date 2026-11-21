import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { validateProfile } from './validation';

const ok = (body: unknown, status = 200) => ({ status, body });
const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: null,
  paynowMobile: null as string | null,
};
// The body of the PATCH sent to `url` (the page also GETs it first)
const sentBody = (calls: unknown[][], url: string) =>
  JSON.parse(
    (
      calls.find(
        ([u, init]) =>
          u === url && (init as RequestInit | undefined)?.method === 'PATCH',
      )![1] as RequestInit
    ).body as string,
  );

describe('Profile: setting the PayNow number', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  it('My bills asks for a PayNow number when there is none, and links to Profile', async () => {
    fakeApi({ 'GET /api/me': ok(chee), 'GET /api/bills': ok([]) });
    renderApp('/bills');
    expect(
      await screen.findByRole('link', {
        name: /Add your PayNow number so friends can pay you back/,
      }),
    ).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('saves a new number and My bills stops asking', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      'GET /api/bills': ok([]),
      'PATCH /api/me': ok({ ...chee, paynowMobile: '+6591234567' }),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    expect(await screen.findByText('chee@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Chee');
    await user.type(screen.getByLabelText('PayNow number'), '+6591234567');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Saved ✓');
    expect(sentBody(fetchMock.mock.calls, '/api/me')).toEqual({
      displayName: 'Chee',
      paynowMobile: '+6591234567',
    });

    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(
      await screen.findByRole('heading', { name: 'My bills' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Add your PayNow number/)).toBeNull();
  });

  it('an empty box removes the number', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok({ ...chee, paynowMobile: '+6591234567' }),
      'PATCH /api/me': ok(chee),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    await user.clear(await screen.findByLabelText('PayNow number'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Saved ✓');
    expect(sentBody(fetchMock.mock.calls, '/api/me').paynowMobile).toBeNull();
  });

  it('checks the number before sending, and shows API errors', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      'PATCH /api/me': ok({ message: 'Something went wrong' }, 500),
    });
    const user = userEvent.setup();
    renderApp('/profile');

    await user.type(await screen.findByLabelText('PayNow number'), '91234567');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText('A Singapore mobile like +6591234567'),
    ).toBeInTheDocument();
    // Nothing was sent: the mistake is caught on the phone
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(false);

    await user.clear(screen.getByLabelText('PayNow number'));
    await user.type(screen.getByLabelText('PayNow number'), '+6591234567');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    );
    expect(screen.queryByText('Saved ✓')).toBeNull();
  });
});

describe('validateProfile', () => {
  it('needs a name and allows an empty PayNow number', () => {
    expect(validateProfile({ displayName: 'Chee', paynowMobile: '' })).toEqual(
      {},
    );
    expect(
      validateProfile({ displayName: ' ', paynowMobile: '+6512345678' }),
    ).toEqual({
      displayName: 'Enter a name (up to 50 characters)',
      paynowMobile: 'A Singapore mobile like +6591234567',
    });
  });
});
