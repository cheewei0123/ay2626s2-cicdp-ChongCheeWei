import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, renderApp, sent } from '../test-utils';
import type { Bill } from './types';

// KAN-101: My bills, where a bill can be swiped to pin, share or delete it

const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: '2026-11-01T00:00:00.000Z',
};
const me = { 'GET /api/me': { status: 200, body: chee } };
const ok = (body?: unknown, status = 200) => ({ status, body });

const make = (id: string, title: string, more: Partial<Bill> = {}): Bill => ({
  id,
  title,
  status: 'OPEN',
  date: '2026-11-24T00:00:00.000Z',
  createdAt: `2026-11-24T1${id.slice(1)}:00:00.000Z`,
  pinnedAt: null,
  serviceBp: 1000,
  gstBp: 900,
  shareToken: `tok-${id}`,
  joinCode: 'K7P2Q',
  participants: [],
  items: [],
  totals: { subtotalCents: 0, serviceCents: 0, gstCents: 0, totalCents: 3537 },
  ...more,
});
const dinner = make('b1', 'Dinner');
const lunch = make('b2', 'Lunch', { status: 'LOCKED' }); // newer than dinner

function setup(bills: Bill[], replies = {}) {
  const fetchMock = fakeApi({ ...me, 'GET /api/bills': ok(bills), ...replies });
  const router = renderApp('/bills');
  return { fetchMock, router };
}

const rowOf = (title: string) =>
  screen.findByRole('link', { name: new RegExp(title) });
const swipeOf = async (title: string) =>
  (await rowOf(title)).closest('[data-testid="swipe"]')!;
const titles = (label: string) =>
  within(
    screen.getByRole('heading', { name: new RegExp(label) })
      .nextSibling as HTMLElement,
  )
    .getAllByRole('link')
    .map((a) => a.textContent);

// A finger going down at x = 0, moving `to` px sideways and lifting
function swipe(el: Element, to: number) {
  fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: to / 2, clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: to, clientY: 0, pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: to, clientY: 0, pointerId: 1 });
}

// A finger tapping: down, up, then the click the browser sends
function tap(el: Element) {
  fireEvent.pointerDown(el, { clientX: 0, clientY: 0 });
  fireEvent.pointerUp(el, { clientX: 0, clientY: 0 });
  fireEvent.click(el.querySelector('a')!);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('splitlah.token', 'jwt-1');
});
afterEach(() => vi.useRealTimers());

describe('My bills list', () => {
  it('lists bills newest first, with their status, day and total', async () => {
    setup([dinner, lunch]);
    const row = await rowOf('Dinner');
    expect(row).toHaveTextContent('Open · 24 Nov');
    expect(row).toHaveTextContent('$35.37');
    expect(row).toHaveAttribute('href', '/bills/b1/edit');
    expect(await rowOf('Lunch')).toHaveAttribute('href', '/bills/b2/summary');
    expect(titles('Bills')).toEqual([
      expect.stringContaining('Lunch'),
      expect.stringContaining('Dinner'),
    ]);
  });

  it('shows pinned bills first, under Pinned', async () => {
    setup([lunch, { ...dinner, pinnedAt: '2026-11-24T12:00:00.000Z' }]);
    await rowOf('Dinner');
    expect(titles('Pinned')).toEqual([expect.stringContaining('Dinner')]);
    expect(titles('Bills')).toEqual([expect.stringContaining('Lunch')]);
  });

  it('says so when the list cannot be loaded', async () => {
    setup([], { 'GET /api/bills': ok({ message: 'boom' }, 500) });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side. Please try again.',
    );
  });

  it('greets a new user with no bills', async () => {
    setup([]);
    expect(
      await screen.findByText('Hi Chee! You have no bills yet.'),
    ).toBeInTheDocument();
  });

  it('can search once there are 6 bills', async () => {
    const six = ['Dinner', 'Lunch', 'Kopi', 'Supper', 'Brunch', 'Movie'].map(
      (t, i) => make(`b${i + 1}`, t),
    );
    const user = userEvent.setup();
    setup(six);
    const box = await screen.findByLabelText('Search bills');

    await user.type(box, 'unch');
    expect(screen.getAllByRole('link', { name: /unch/ })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /Dinner/ })).toBeNull();

    await user.clear(box);
    await user.type(box, 'zzz');
    expect(screen.getByText('No bills match “zzz”.')).toBeInTheDocument();
  });

  it('has no search box for a short list', async () => {
    setup([dinner]);
    await rowOf('Dinner');
    expect(screen.queryByLabelText('Search bills')).toBeNull();
  });
});

describe('Swiping a bill', () => {
  it('right shows Pin; tapping it pins the bill to the top', async () => {
    const { fetchMock } = setup([dinner, lunch], {
      'POST /api/bills/b1/pin': ok(undefined, 204),
    });
    swipe(await swipeOf('Dinner'), 60);
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));

    await waitFor(() =>
      expect(titles('Pinned')).toEqual([expect.stringContaining('Dinner')]),
    );
    expect(sent(fetchMock)[0][0]).toBe('/api/bills/b1/pin');
    expect(sent(fetchMock)[0][1]?.method).toBe('POST');
  });

  it('a long swipe right unpins at once', async () => {
    const { fetchMock } = setup(
      [{ ...dinner, pinnedAt: '2026-11-24T12:00:00.000Z' }],
      { 'DELETE /api/bills/b1/pin': ok(undefined, 204) },
    );
    swipe(await swipeOf('Dinner'), 250);

    await waitFor(() => expect(titles('Bills')).toHaveLength(1));
    expect(screen.queryByRole('heading', { name: /Pinned/ })).toBeNull();
    expect(sent(fetchMock)[0][1]?.method).toBe('DELETE');
  });

  it('moves a pin back and says why when the API refuses', async () => {
    setup([dinner], {
      'POST /api/bills/b1/pin': ok({ message: 'Bill not found' }, 404),
    });
    swipe(await swipeOf('Dinner'), 250);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bill not found',
    );
    expect(screen.queryByRole('heading', { name: /Pinned/ })).toBeNull();
  });

  it('left shows Share and Delete for an open bill, only Share for a locked one', async () => {
    setup([dinner, lunch]);
    swipe(await swipeOf('Dinner'), -150);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    // Opening another row closes the first
    swipe(await swipeOf('Lunch'), -150);
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('a long swipe left on a locked bill only opens it; it is never deleted', async () => {
    const { fetchMock } = setup([lunch]);
    swipe(await swipeOf('Lunch'), -250);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lunch/ })).toBeInTheDocument();
    expect(sent(fetchMock)).toHaveLength(0);
  });

  it('with a mouse, the click that ends the swipe keeps the row open', async () => {
    const { router } = setup([dinner]);
    swipe(await swipeOf('Dinner'), -150);
    fireEvent.click(await rowOf('Dinner')); // a mouse drag ends in a click
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bills');
  });

  it('a short swipe snaps back, and the finger lifting does not open the bill', async () => {
    const { router } = setup([dinner]);
    const row = await swipeOf('Dinner');
    swipe(row, 20);
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();
    fireEvent.click(await rowOf('Dinner'));
    expect(router.state.location.pathname).toBe('/bills');
  });

  it('a mouse hovering over a bill does not slide it open', async () => {
    setup([dinner]);
    const row = await swipeOf('Dinner');
    fireEvent.pointerMove(row, { clientX: 200, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 300, clientY: 0, pointerId: 1 });
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();
    // and after a real swipe ends, hovering again does not drag the row
    swipe(row, 20);
    fireEvent.pointerMove(row, { clientX: 300, clientY: 0, pointerId: 1 });
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();
  });

  it('a mouse let go outside the row does not drag it when it comes back', async () => {
    setup([dinner]);
    const row = await swipeOf('Dinner');
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0, pointerId: 1 });
    // the button came up somewhere else, so the row never heard pointerup
    fireEvent.pointerMove(row, {
      clientX: 300,
      clientY: 0,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 0,
    });
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();
  });

  it('a tap on an open row closes it instead of opening the bill', async () => {
    const { router } = setup([dinner], { 'GET /api/bills/b1': ok(dinner) });
    const row = await swipeOf('Dinner');
    swipe(row, -150); // a finger: no click follows a swipe
    tap(row);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(router.state.location.pathname).toBe('/bills');

    tap(row); // closed now, so the next tap opens the bill
    expect(router.state.location.pathname).toBe('/bills/b1/edit');
  });

  it('scrolling up or down is not a swipe', async () => {
    setup([dinner]);
    const row = await swipeOf('Dinner');
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(row, { clientX: 5, clientY: 40 });
    fireEvent.pointerUp(row, { clientX: 5, clientY: 40 });
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();
  });

  it('a plain tap still opens the bill', async () => {
    const { router } = setup([dinner], { 'GET /api/bills/b1': ok(dinner) });
    const row = await swipeOf('Dinner');
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(row, { clientX: 0, clientY: 0 });
    fireEvent.click(await rowOf('Dinner'));
    expect(router.state.location.pathname).toBe('/bills/b1/edit');
  });

  it('shows a tip until the first swipe', async () => {
    setup([dinner]);
    const tip = await screen.findByText(/Tip: swipe a bill right/);
    swipe(await swipeOf('Dinner'), 60);
    expect(tip).not.toBeInTheDocument();
    expect(localStorage.getItem('splitlah.swipeTip')).toBe('done');
  });
});

describe('Deleting a bill', () => {
  it('takes it off the list with Undo; Undo brings it back and nothing is sent', async () => {
    const { fetchMock } = setup([dinner]);
    swipe(await swipeOf('Dinner'), -150);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByRole('link', { name: /Dinner/ })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Dinner');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(await rowOf('Dinner')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(sent(fetchMock)).toHaveLength(0);
  });

  it('sends the delete when Undo has had its 5 seconds', async () => {
    const { fetchMock } = setup([dinner], {
      'DELETE /api/bills/b1': ok(undefined, 204),
    });
    const row = await swipeOf('Dinner');
    vi.useFakeTimers();
    swipe(row, -250); // a long swipe deletes at once
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Dinner');

    act(() => vi.advanceTimersByTime(4999));
    expect(sent(fetchMock)).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    vi.useRealTimers();

    await waitFor(() => expect(sent(fetchMock)).toHaveLength(1));
    expect(sent(fetchMock)[0][0]).toBe('/api/bills/b1');
    expect(sent(fetchMock)[0][1]?.method).toBe('DELETE');
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      await screen.findByText('Hi Chee! You have no bills yet.'),
    ).toBeInTheDocument();
  });

  it('a second delete sends the first one straight away', async () => {
    const { fetchMock } = setup([dinner, make('b3', 'Kopi')], {
      'DELETE /api/bills/b1': ok(undefined, 204),
    });
    swipe(await swipeOf('Dinner'), -250);
    swipe(await swipeOf('Kopi'), -250);

    await waitFor(() => expect(sent(fetchMock)).toHaveLength(1));
    expect(sent(fetchMock)[0][0]).toBe('/api/bills/b1');
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Kopi');
  });

  it('sends a waiting delete when you leave the page', async () => {
    const { fetchMock, router } = setup([dinner], {
      'DELETE /api/bills/b1': ok(undefined, 204),
    });
    swipe(await swipeOf('Dinner'), -250);
    await act(() => router.navigate('/bills/new'));
    await waitFor(() => expect(sent(fetchMock)).toHaveLength(1));
  });

  it('brings the bill back and says why if the API keeps it', async () => {
    setup([dinner], {
      'DELETE /api/bills/b1': ok(
        { message: 'Bill is locked; unlock it to make changes' },
        409,
      ),
    });
    const row = await swipeOf('Dinner');
    vi.useFakeTimers();
    swipe(row, -250);
    act(() => vi.advanceTimersByTime(5000));
    vi.useRealTimers();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bill is locked; unlock it to make changes',
    );
    expect(await rowOf('Dinner')).toBeInTheDocument();
  });
});

describe('Sharing a bill', () => {
  it("opens the phone's share sheet with the link", async () => {
    const share = vi.fn().mockRejectedValue(new Error('cancelled'));
    vi.stubGlobal('navigator', { ...navigator, share });
    setup([dinner]);
    swipe(await swipeOf('Dinner'), -150);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Dinner',
      url: `${window.location.origin}/s/tok-b1`,
    });
    vi.unstubAllGlobals();
  });

  it('goes to the QR code page where there is no share sheet', async () => {
    const { router } = setup([dinner], { 'GET /api/bills/b1': ok(dinner) });
    swipe(await swipeOf('Dinner'), -150);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(router.state.location.pathname).toBe('/bills/b1/share');
  });
});

describe('The bill menu (long press or More)', () => {
  it('opens on a long press, and its actions work', async () => {
    const { fetchMock } = setup([dinner], {
      'POST /api/bills/b1/pin': ok(undefined, 204),
    });
    const row = await swipeOf('Dinner');
    vi.useFakeTimers();
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0 });
    act(() => vi.advanceTimersByTime(500));
    vi.useRealTimers();
    fireEvent.pointerUp(row, { clientX: 0, clientY: 0 });

    const menu = screen.getByRole('dialog', { name: 'Dinner actions' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Pin to top' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(sent(fetchMock)).toHaveLength(1));
    expect(
      await screen.findByRole('heading', { name: /Pinned/ }),
    ).toBeInTheDocument();
  });

  it('opens with a right-click, and Delete there has Undo too', async () => {
    setup([dinner]);
    fireEvent.contextMenu(await swipeOf('Dinner'));
    const menu = screen.getByRole('dialog', { name: 'Dinner actions' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Dinner');
  });

  it('opens from the More button, for keyboards and screen readers', async () => {
    const user = userEvent.setup();
    setup([{ ...lunch, pinnedAt: '2026-11-24T12:00:00.000Z' }], {
      'GET /api/bills/b2': ok(lunch),
    });
    await user.click(
      await screen.findByRole('button', { name: 'More for Lunch' }),
    );
    const menu = screen.getByRole('dialog', { name: 'Lunch actions' });
    expect(within(menu).getByRole('button', { name: 'Unpin' })).toHaveFocus();
    // A locked bill: no Delete, and the menu says why
    expect(within(menu).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(menu).toHaveTextContent("A locked bill can't be deleted");
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with Cancel or a tap outside it, and Share works from it', async () => {
    const { router } = setup([dinner], { 'GET /api/bills/b1': ok(dinner) });
    fireEvent.contextMenu(await swipeOf('Dinner'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.contextMenu(await swipeOf('Dinner'));
    fireEvent.click(screen.getByRole('heading', { name: 'Dinner' })); // inside: stays
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog')); // the dark area around it
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.contextMenu(await swipeOf('Dinner'));
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(router.state.location.pathname).toBe('/bills/b1/share');
  });
});
