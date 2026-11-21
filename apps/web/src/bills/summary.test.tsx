import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { guestStore } from './guest';

const ok = (body: unknown, status = 200) => ({ status, body });
const chee = { id: 'u1', email: 'chee@example.com', displayName: 'Chee' };
const claim = (participantId: string) => ({
  participantId,
  shares: 1,
  percentBp: null,
  exactCents: null,
});

// The brief's bill: Chee had the chicken rice, Ali the laksa, Ben and Dan shared the beer
const items = [
  {
    id: 'i1',
    name: 'Chicken Rice',
    unitPriceCents: 600,
    quantity: 1,
    splitMode: 'EQUAL',
    claims: [claim('p-chee')],
  },
  {
    id: 'i2',
    name: 'Laksa',
    unitPriceCents: 750,
    quantity: 1,
    splitMode: 'EQUAL',
    claims: [claim('p-ali')],
  },
  {
    id: 'i3',
    name: 'Tiger Beer',
    unitPriceCents: 800,
    quantity: 2,
    splitMode: 'EQUAL',
    claims: [claim('p-ben'), claim('p-dan')],
  },
];
const person = (
  participantId: string,
  displayName: string,
  [itemsCents, serviceCents, gstCents]: number[],
  more: object = {},
) => ({
  participantId,
  displayName,
  isOwner: false,
  itemsCents,
  serviceCents,
  gstCents,
  totalCents: itemsCents + serviceCents + gstCents,
  paid: false,
  ...more,
});
// The same numbers as the API's summary test: 720 + 899 + 959 + 959 = 3537
const briefSummary = {
  subtotalCents: 2950,
  serviceCents: 295,
  gstCents: 292,
  totalCents: 3537,
  unclaimedCents: 0,
  people: [
    person('p-chee', 'Chee', [600, 60, 60], { isOwner: true }),
    person('p-ali', 'Ali', [750, 75, 74], { paid: true }),
    person('p-ben', 'Ben', [800, 80, 79]),
    person('p-dan', 'Dan', [800, 80, 79]),
  ],
};
const bill = (status = 'OPEN') => ({
  id: 'b1',
  title: 'Dinner at Maxwell',
  status,
  serviceBp: 1000,
  gstBp: 900,
  shareToken: 'tok',
  joinCode: 'K7P2Q',
  participants: [],
  items,
  totals: {
    subtotalCents: 2950,
    serviceCents: 295,
    gstCents: 292,
    totalCents: 3537,
  },
});
const owner = (status = 'OPEN') => ({
  'GET /api/me': ok(chee),
  'GET /api/bills/b1': ok(bill(status)),
  'GET /api/bills/b1/summary': ok(briefSummary),
});
const card = (name: string) => within(screen.getByRole('article', { name }));

describe('Summary (owner)', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  it("shows the brief's answer: You $7.20, Ali $8.99, Ben $9.59, Dan $9.59 = $35.37", async () => {
    fakeApi(owner());
    renderApp('/bills/b1/summary');

    expect(
      await screen.findByRole('article', { name: 'You' }),
    ).toHaveTextContent('$7.20');
    expect(card('Ali').getByText('$8.99')).toBeInTheDocument();
    expect(card('Ben').getByText('$9.59')).toBeInTheDocument();
    expect(card('Dan').getByText('$9.59')).toBeInTheDocument();
    expect(screen.getByText('$35.37')).toBeInTheDocument();
    expect(
      screen.getByText("Everyone's totals add up to $35.37 ✓"),
    ).toBeInTheDocument();

    // What each person had, and their part of the service charge and GST
    expect(card('You').getByText('Chicken Rice')).toBeInTheDocument();
    expect(card('Ben').getByText('Tiger Beer (shared)')).toBeInTheDocument();
    expect(card('Ali').getByText('$0.75')).toBeInTheDocument(); // service
    expect(card('Ali').getByText('$0.74')).toBeInTheDocument(); // GST
    expect(card('Ali').getByText('Paid')).toBeInTheDocument();
    expect(card('Ben').queryByText('Paid')).toBeNull();
    // Nothing is unclaimed, so there is no warning
    expect(screen.queryByText(/unclaimed/)).toBeNull();
  });

  it('warns about unclaimed items and gives them to the owner', async () => {
    fakeApi({
      ...owner(),
      'GET /api/bills/b1': ok({
        ...bill(),
        items: [...items.slice(0, 2), { ...items[2], claims: [] }],
      }),
      'GET /api/bills/b1/summary': ok({
        ...briefSummary,
        unclaimedCents: 1600,
        people: [
          person('p-chee', 'Chee', [2200, 220, 218], { isOwner: true }),
          person('p-ali', 'Ali', [750, 75, 74]),
          person('p-ben', 'Ben', [0, 0, 0]),
        ],
      }),
    });
    renderApp('/bills/b1/summary');

    expect(await screen.findByRole('status')).toHaveTextContent(
      '$16.00 unclaimed, assigned to you',
    );
    expect(
      card('You').getByText('Chicken Rice, Tiger Beer (unclaimed)'),
    ).toBeInTheDocument();
    expect(card('Ben').getByText('Nothing yet')).toBeInTheDocument();
  });

  it('says so if the totals ever stop adding up', async () => {
    fakeApi({
      ...owner(),
      'GET /api/bills/b1/summary': ok({ ...briefSummary, totalCents: 3600 }),
    });
    renderApp('/bills/b1/summary');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Everyone's totals don't add up to $36.00",
    );
  });

  it('Lock bill locks it, then it can be unlocked', async () => {
    const replies = {
      ...owner(),
      'POST /api/bills/b1/lock': ok({ id: 'b1', status: 'LOCKED' }),
      'POST /api/bills/b1/unlock': ok({ id: 'b1', status: 'OPEN' }),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/bills/b1/summary');

    const lock = await screen.findByRole('button', { name: 'Lock bill' });
    replies['GET /api/bills/b1'] = ok(bill('LOCKED'));
    await user.click(lock);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Locked. Nobody can change their items now.',
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === '/api/bills/b1/lock' &&
          (init as RequestInit).method === 'POST',
      ),
    ).toBe(true);

    replies['GET /api/bills/b1'] = ok(bill('OPEN'));
    await user.click(
      screen.getByRole('button', { name: 'Unlock to make changes' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Lock bill' }),
    ).toBeEnabled();
    expect(screen.queryByText(/^Locked\./)).toBeNull();
  });

  it('shows why the bill could not be locked', async () => {
    fakeApi({
      ...owner(),
      'POST /api/bills/b1/lock': ok(
        { message: 'Only an OPEN bill can be locked' },
        409,
      ),
    });
    const user = userEvent.setup();
    renderApp('/bills/b1/summary');

    await user.click(await screen.findByRole('button', { name: 'Lock bill' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only an OPEN bill can be locked',
    );
    expect(screen.getByRole('button', { name: 'Lock bill' })).toBeEnabled();
  });

  it("says so when the summary can't be loaded", async () => {
    fakeApi({
      ...owner(),
      'GET /api/bills/b1/summary': ok({ message: 'Bill not found' }, 404),
    });
    renderApp('/bills/b1/summary');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bill not found',
    );
  });

  it('a locked bill opens its summary from My bills', async () => {
    fakeApi({
      ...owner(),
      'GET /api/bills': ok([bill('LOCKED')]),
    });
    renderApp('/bills');
    expect(
      await screen.findByRole('link', { name: /Dinner at Maxwell/ }),
    ).toHaveAttribute('href', '/bills/b1/summary');
  });

  it('the share screen links to the summary', async () => {
    fakeApi(owner());
    renderApp('/bills/b1/share');
    expect(
      await screen.findByRole('link', { name: 'See summary' }),
    ).toHaveAttribute('href', '/bills/b1/summary');
  });
});

describe('Summary tab (guest)', () => {
  beforeEach(() =>
    guestStore.set('tok', { token: 'guest-jwt', participantId: 'p-ben' }),
  );

  it("shows everyone's breakdown, with my card as You", async () => {
    fakeApi({
      'GET /api/share/tok': ok({
        title: 'Dinner at Maxwell',
        status: 'OPEN',
        owner: { displayName: 'Chee' },
        participants: [],
        items,
      }),
      'GET /api/share/tok/summary': ok({ ...briefSummary, unclaimedCents: 50 }),
    });
    const user = userEvent.setup();
    renderApp('/s/tok');

    const tab = await screen.findByRole('tab', { name: 'Summary' });
    expect(screen.getByRole('tab', { name: 'My items' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(tab);

    expect(
      screen.getByRole('heading', { name: 'Summary' }),
    ).toBeInTheDocument();
    expect(card('You').getByText('$9.59')).toBeInTheDocument();
    expect(card('Chee').getByText('$7.20')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '$0.50 unclaimed, assigned to Chee',
    );

    await user.click(screen.getByRole('tab', { name: 'My items' }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Tap what you had' }),
      ).toBeInTheDocument(),
    );
  });
});

describe('Marking who has paid (owner)', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  it('ticks a person as paid once the bill is locked and shows the progress', async () => {
    const replies = {
      ...owner('LOCKED'),
      'PATCH /api/bills/b1/payments/p-ben': ok({ paid: true }),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/bills/b1/summary');

    // Ali already paid; Ben and Dan haven't. Nobody ticks the owner.
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 / 3 paid you back',
    );
    expect(
      card('Ali').getByRole('button', { name: 'Ali has paid' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(card('You').queryByRole('button')).toBeNull();

    replies['GET /api/bills/b1/summary'] = ok({
      ...briefSummary,
      people: briefSummary.people.map((p) =>
        p.participantId === 'p-ben' ? { ...p, paid: true } : p,
      ),
    });
    await user.click(card('Ben').getByRole('button', { name: 'Ben has paid' }));

    const patch = fetchMock.mock.calls.find(
      ([url]) => url === '/api/bills/b1/payments/p-ben',
    )!;
    expect((patch[1] as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({
      paid: true,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 / 3 paid you back',
    );
    expect(
      card('Ben').getByRole('button', { name: 'Ben has paid' }),
    ).toHaveTextContent('Paid ✓');
  });

  it('has no paid buttons while the bill is open', async () => {
    fakeApi(owner('OPEN'));
    renderApp('/bills/b1/summary');
    await screen.findByRole('button', { name: 'Lock bill' });
    expect(screen.queryByRole('button', { name: /has paid/ })).toBeNull();
  });

  it('shows a settled bill, with no unlock button', async () => {
    fakeApi({
      ...owner('SETTLED'),
      'GET /api/bills/b1/summary': ok({
        ...briefSummary,
        people: briefSummary.people.map((p) => ({ ...p, paid: !p.isOwner })),
      }),
    });
    renderApp('/bills/b1/summary');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Settled. Everyone has paid you ✓',
    );
    expect(screen.queryByRole('button', { name: /Unlock/ })).toBeNull();
  });

  it("shows why a payment couldn't be saved", async () => {
    fakeApi({
      ...owner('LOCKED'),
      'PATCH /api/bills/b1/payments/p-dan': ok(
        { message: 'Lock the bill before marking payments' },
        409,
      ),
    });
    const user = userEvent.setup();
    renderApp('/bills/b1/summary');
    await user.click(
      await screen.findByRole('button', { name: 'Dan has paid' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lock the bill before marking payments',
    );
  });
});
