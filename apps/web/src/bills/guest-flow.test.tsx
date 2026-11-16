import { renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { guestStore } from './guest';
import { usePolling } from './usePolling';

const ok = (body: unknown, status = 200) => ({ status, body });
const sent = (call: unknown[]) => call[1] as RequestInit;

// The bill as a friend sees it. Chee paid; Ali and Ben have joined.
const shared = (claims: Record<string, string[]> = {}, status = 'OPEN') => ({
  title: 'Dinner at Maxwell',
  status,
  owner: { displayName: 'Chee' },
  participants: [
    { id: 'p-ali', displayName: 'Ali' },
    { id: 'p-ben', displayName: 'Ben' },
  ],
  items: [
    { id: 'i1', name: 'Chicken Rice', unitPriceCents: 600, quantity: 1 },
    { id: 'i2', name: 'Laksa', unitPriceCents: 750, quantity: 1 },
    { id: 'i3', name: 'Tiger Beer', unitPriceCents: 800, quantity: 2 },
  ].map((item) => ({
    ...item,
    claims: (claims[item.id] ?? []).map((participantId) => ({ participantId })),
  })),
});
const summary = (aliCents: number) =>
  ok({ people: [{ participantId: 'p-ali', totalCents: aliCents }] });

const asAli = () =>
  guestStore.set('tok', { token: 'guest-jwt', participantId: 'p-ali' });

describe('Joining a bill from the link', () => {
  it('asks for a name once, joins without an account and shows the items', async () => {
    const fetchMock = fakeApi({
      'GET /api/share/tok': ok(shared()),
      'GET /api/share/tok/summary': summary(0),
      'POST /api/share/tok/participants': ok(
        {
          participant: { id: 'p-ali', displayName: 'Ali' },
          guestToken: 'guest-jwt',
        },
        201,
      ),
    });
    const user = userEvent.setup();
    renderApp('/s/tok');

    expect(
      await screen.findByText('Chee invited you to split this bill'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your name'), ' Ali ');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(
      await screen.findByRole('heading', { name: 'Tap what you had' }),
    ).toBeInTheDocument();
    const join = fetchMock.mock.calls.find(
      ([url]) => url === '/api/share/tok/participants',
    )!;
    expect(JSON.parse(sent(join).body as string)).toEqual({
      displayName: 'Ali',
    });
    // Remembered on this phone, so a refresh doesn't ask again
    expect(guestStore.get('tok')).toEqual({
      token: 'guest-jwt',
      participantId: 'p-ali',
    });
    // No login token was ever needed
    expect(sent(join).headers).not.toHaveProperty('Authorization');
  });

  it('needs a name, and shows why joining failed', async () => {
    fakeApi({
      'GET /api/share/tok': ok(shared()),
      'GET /api/share/tok/summary': summary(0),
      'POST /api/share/tok/participants': ok(
        { message: 'This bill is locked and can no longer be joined' },
        409,
      ),
    });
    const user = userEvent.setup();
    renderApp('/s/tok');

    await user.click(await screen.findByRole('button', { name: 'Join' }));
    expect(
      screen.getByText('Enter your name (up to 30 characters)'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your name'), 'Ali');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This bill is locked and can no longer be joined',
    );
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
  });

  it('says so when the link is wrong', async () => {
    fakeApi({
      'GET /api/share/nope': ok({ message: 'Bill not found' }, 404),
      'GET /api/share/nope/summary': ok({ message: 'Bill not found' }, 404),
    });
    renderApp('/s/nope');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bill not found',
    );
  });
});

describe('Tapping what you had', () => {
  it('shows who has each item and my total', async () => {
    asAli();
    fakeApi({
      'GET /api/share/tok': ok(
        shared({ i2: ['p-ali'], i3: ['p-ali', 'p-ben'] }),
      ),
      'GET /api/share/tok/summary': summary(1858),
    });
    renderApp('/s/tok');

    const rice = await screen.findByRole('button', { name: /Chicken Rice/ });
    expect(rice).toHaveTextContent('Nobody yet');
    expect(rice).toHaveAttribute('aria-pressed', 'false');
    const laksa = screen.getByRole('button', { name: /Laksa/ });
    expect(laksa).toHaveTextContent('You');
    expect(laksa).toHaveAttribute('aria-pressed', 'true');
    const beer = screen.getByRole('button', { name: /Tiger Beer/ });
    expect(beer).toHaveTextContent('You, Ben · shared');
    expect(beer).toHaveTextContent('$16.00');
    expect(screen.getByText('My total so far').closest('dl')).toHaveTextContent(
      '$18.58',
    );
    expect(
      screen.getByText('Dinner at Maxwell · paid by Chee'),
    ).toBeInTheDocument();
  });

  it('tapping claims an item with the guest token, tapping again takes it back', async () => {
    asAli();
    const replies = {
      'GET /api/share/tok': ok(shared()),
      'GET /api/share/tok/summary': summary(0),
      'POST /api/share/tok/claims': ok({}, 201),
      'DELETE /api/share/tok/claims/i1': { status: 204 },
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/s/tok');

    const rice = await screen.findByRole('button', { name: /Chicken Rice/ });
    replies['GET /api/share/tok'] = ok(shared({ i1: ['p-ali'] }));
    replies['GET /api/share/tok/summary'] = summary(720);
    await user.click(rice);

    await waitFor(() => expect(rice).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText('$7.20')).toBeInTheDocument();
    const claim = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit).method === 'POST',
    )!;
    expect(claim[0]).toBe('/api/share/tok/claims');
    expect(JSON.parse(sent(claim).body as string)).toEqual({ itemId: 'i1' });
    expect(sent(claim).headers).toMatchObject({ 'X-Guest-Token': 'guest-jwt' });

    replies['GET /api/share/tok'] = ok(shared());
    replies['GET /api/share/tok/summary'] = summary(0);
    await user.click(rice);
    await waitFor(() => expect(rice).toHaveAttribute('aria-pressed', 'false'));
    const unclaim = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit).method === 'DELETE',
    )!;
    expect(unclaim[0]).toBe('/api/share/tok/claims/i1');
    expect(sent(unclaim).headers).toMatchObject({
      'X-Guest-Token': 'guest-jwt',
    });
  });

  it('a locked bill is read-only and says so', async () => {
    asAli();
    fakeApi({
      'GET /api/share/tok': ok(shared({ i1: ['p-ali'] }, 'LOCKED')),
      'GET /api/share/tok/summary': summary(720),
    });
    renderApp('/s/tok');

    expect(await screen.findByRole('status')).toHaveTextContent(
      "This bill is locked, so it can't be changed any more.",
    );
    expect(screen.getByRole('button', { name: /Chicken Rice/ })).toBeDisabled();
  });

  it('shows why a tap was refused', async () => {
    asAli();
    fakeApi({
      'GET /api/share/tok': ok(shared()),
      'GET /api/share/tok/summary': summary(0),
      'POST /api/share/tok/claims': ok(
        { message: 'This bill is locked and can no longer be changed' },
        409,
      ),
    });
    const user = userEvent.setup();
    renderApp('/s/tok');

    await user.click(await screen.findByRole('button', { name: /Laksa/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This bill is locked and can no longer be changed',
    );
  });

  it('asks for the name again when the guest token has run out, without logging the owner out', async () => {
    asAli();
    localStorage.setItem('splitlah.token', 'owner-jwt'); // the same phone is logged in
    fakeApi({
      'GET /api/me': ok({
        id: 'u1',
        email: 'c@example.com',
        displayName: 'Chee',
      }),
      'GET /api/share/tok': ok(shared()),
      'GET /api/share/tok/summary': summary(0),
      'POST /api/share/tok/claims': ok({ message: 'Unauthorized' }, 401),
    });
    const user = userEvent.setup();
    renderApp('/s/tok');

    await user.click(await screen.findByRole('button', { name: /Laksa/ }));

    expect(await screen.findByLabelText('Your name')).toBeInTheDocument();
    expect(guestStore.get('tok')).toBeNull();
    expect(localStorage.getItem('splitlah.token')).toBe('owner-jwt');
  });
});

describe('Share screen (owner)', () => {
  const bill = {
    id: 'b1',
    title: 'Dinner at Maxwell',
    status: 'OPEN',
    shareToken: 'tok',
    joinCode: 'K7P2Q',
    items: [],
    participants: [{ id: 'p-ali', displayName: 'Ali' }],
  };
  const me = {
    'GET /api/me': ok({
      id: 'u1',
      email: 'c@example.com',
      displayName: 'Chee',
    }),
  };

  it('shows the QR code, the join code and who has joined, and copies the link', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    fakeApi({ ...me, 'GET /api/bills/b1': ok(bill) });
    const user = userEvent.setup();
    renderApp('/bills/b1/share');

    expect(await screen.findByText('K7P2Q')).toBeInTheDocument();
    expect(screen.getByTitle('QR code to join this bill')).toBeInTheDocument();
    expect(screen.getByText('Ali')).toBeInTheDocument();
    // jsdom has no share sheet, so that button is not offered
    expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(
      await screen.findByRole('button', { name: 'Link copied ✓' }),
    ).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/s/tok`,
    );
  });

  it('offers the phone share sheet where there is one', async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    const share = vi.fn();
    vi.stubGlobal('navigator', Object.assign(navigator, { share }));
    fakeApi({
      ...me,
      'GET /api/bills/b1': ok({ ...bill, participants: [] }),
    });
    const user = userEvent.setup();
    renderApp('/bills/b1/share');

    expect(
      await screen.findByText('Nobody yet. This updates by itself.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share…' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Dinner at Maxwell',
      url: `${window.location.origin}/s/tok`,
    });
    delete (navigator as { share?: unknown }).share;
  });

  it("says so when the bill can't be loaded", async () => {
    localStorage.setItem('splitlah.token', 'jwt-1');
    fakeApi({
      ...me,
      'GET /api/bills/b1': ok({ message: 'Bill not found' }, 404),
    });
    renderApp('/bills/b1/share');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bill not found',
    );
  });
});

describe('usePolling', () => {
  afterEach(() => vi.useRealTimers());

  it('loads at once, again every 5 seconds, and stops when the page is left', () => {
    vi.useFakeTimers();
    const load = vi.fn();
    const { unmount } = renderHook(() => usePolling(load));

    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10000);
    expect(load).toHaveBeenCalledTimes(4);

    unmount();
    vi.advanceTimersByTime(20000);
    expect(load).toHaveBeenCalledTimes(4);
  });
});
