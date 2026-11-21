import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { dayLabel, monthLabel, sgDay, sgMonth, shiftMonth } from './dates';
import { validateExpense, emptyForm } from './form';

// A photo can't be shrunk in jsdom (no canvas); shrinkImage was tried in a real browser
vi.mock('../bills/image', () => ({ shrinkImage: async (file: File) => file }));

const ok = (body: unknown, status = 200) => ({ status, body });
const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: null,
  paynowMobile: '+6591234567',
};
const expense = <T extends object>(id: string, more: T) => ({
  id,
  category: 'FOOD_DRINKS',
  merchant: null,
  note: null,
  source: 'MANUAL',
  billId: null,
  ...more,
});
// November: Chee's share of the brief's bill, a coffee and a grab ride
const items = [
  expense('e1', {
    amountCents: 720,
    merchant: 'Maxwell Food Centre',
    spentAt: '2026-11-21T00:00:00.000Z',
    source: 'BILL_SHARE',
    billId: 'b1',
  }),
  expense('e2', {
    amountCents: 680,
    merchant: 'Kopi',
    spentAt: '2026-11-21T01:00:00.000Z',
    source: 'RECEIPT',
  }),
  expense('e3', {
    amountCents: 1600,
    category: 'TRANSPORT',
    spentAt: '2026-11-20T00:00:00.000Z',
  }),
];
const november = {
  'GET /api/me': ok(chee),
  'GET /api/expenses?month=2026-11&pageSize=100': ok({
    month: '2026-11',
    totalCount: 3,
    items,
  }),
  'GET /api/expenses/summary?month=2026-11': ok({
    month: '2026-11',
    totalCents: 3000,
    byCategory: [
      { category: 'TRANSPORT', totalCents: 1600, count: 1 },
      { category: 'FOOD_DRINKS', totalCents: 1400, count: 2 },
    ],
  }),
};
const emptyMonth = (month: string) => ({
  [`GET /api/expenses?month=${month}&pageSize=100`]: ok({
    month,
    totalCount: 0,
    items: [],
  }),
  [`GET /api/expenses/summary?month=${month}`]: ok({
    month,
    totalCents: 0,
    byCategory: [],
  }),
});
const sent = (calls: unknown[][], method: string, url: string) =>
  JSON.parse(
    (
      calls.find(
        ([u, init]) =>
          u === url && (init as RequestInit | undefined)?.method === method,
      )![1] as RequestInit
    ).body as string,
  );

describe('Expenses: this month', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  it('shows the total, the category bars and the list by day; the totals agree', async () => {
    fakeApi(november);
    renderApp('/expenses?month=2026-11');

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    const hero = await screen.findByRole('region', { name: 'Month total' });
    expect(hero).toHaveTextContent('$30.00');
    expect(screen.getByRole('heading', { name: 'Nov 2026' })).toBeVisible();

    const bars = within(
      screen.getByRole('list', { name: 'Spending by category' }),
    ).getAllByRole('listitem');
    expect(bars.map((b) => b.textContent)).toEqual([
      '🚇 Transport$16.00 53%',
      '🍜 Food & drinks$14.00 47%',
    ]);

    // Newest day first; the bill share says where it came from
    const saturday = screen.getByRole('heading', { name: /Sat 21 Nov/ });
    expect(saturday).toHaveTextContent('2');
    const rows = screen.getAllByRole('button', { name: /\$\d/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      '🍜Maxwell Food CentreSplit bill$7.20›',
      '🍜KopiReceipt$6.80›',
      '🚇TransportManual$16.00›',
    ]);
    // List total = chart total = API total
    const listCents = items.reduce((sum, e) => sum + e.amountCents, 0);
    expect(listCents).toBe(3000);
  });

  it('opens on this month, switches months and shows an empty month', async () => {
    const now = sgMonth();
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      ...emptyMonth(now),
      ...emptyMonth(shiftMonth(now, -1)),
    });
    const user = userEvent.setup();
    renderApp('/expenses');

    expect(
      await screen.findByText(/Nothing spent in .* yet/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Spending by category' }),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Expenses' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(
      await screen.findByRole('heading', {
        name: monthLabel(shiftMonth(now, -1)),
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/expenses/summary?month=${shiftMonth(now, -1)}`,
        expect.anything(),
      ),
    );
  });

  it('says when the month could not be loaded', async () => {
    fakeApi({
      ...november,
      'GET /api/expenses/summary?month=2026-11': ok({}, 500),
    });
    renderApp('/expenses?month=2026-11');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side',
    );
  });

  it('says when only the newest 100 are shown', async () => {
    fakeApi({
      ...november,
      'GET /api/expenses?month=2026-11&pageSize=100': ok({
        month: '2026-11',
        totalCount: 140,
        items,
      }),
    });
    renderApp('/expenses?month=2026-11');
    expect(
      await screen.findByText('Showing the newest 3 of 140.'),
    ).toBeInTheDocument();
  });
});

describe('Expenses: editing', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  it('fixes a manual expense, checking the amount first', async () => {
    const fetchMock = fakeApi({
      ...november,
      'PATCH /api/expenses/e3': ok({}),
    });
    const user = userEvent.setup();
    renderApp('/expenses?month=2026-11');

    await user.click(await screen.findByRole('button', { name: /Manual/ }));
    const sheet = screen.getByRole('dialog', { name: 'Edit expense' });
    const amount = within(sheet).getByLabelText('Amount ($)');
    expect(amount).toHaveValue('16.00');

    await user.clear(amount);
    await user.type(amount, 'abc');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByText('Enter an amount like 7.20')).toBeVisible();

    await user.clear(amount);
    await user.type(amount, '15.5');
    await user.selectOptions(
      within(sheet).getByLabelText('Category'),
      'TRAVEL',
    );
    await user.type(within(sheet).getByLabelText('Note'), 'Airport');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent(fetchMock.mock.calls, 'PATCH', '/api/expenses/e3')).toEqual({
      amountCents: 1550,
      category: 'TRAVEL',
      spentAt: '2026-11-20',
      merchant: '',
      note: 'Airport',
    });
  });

  it('a bill share only changes category and note, and links to its bill', async () => {
    const fetchMock = fakeApi({
      ...november,
      'PATCH /api/expenses/e1': ok({}),
    });
    const user = userEvent.setup();
    renderApp('/expenses?month=2026-11');

    await user.click(await screen.findByRole('button', { name: /Split bill/ }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByLabelText('Amount ($)')).toBeNull();
    expect(within(sheet).queryByLabelText('Date')).toBeNull();
    expect(
      within(sheet).queryByRole('button', { name: 'Delete expense' }),
    ).toBeNull();
    expect(
      within(sheet).getByRole('link', { name: 'Open the bill ›' }),
    ).toHaveAttribute('href', '/bills/b1/summary');

    await user.selectOptions(
      within(sheet).getByLabelText('Category'),
      'ENTERTAINMENT',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent(fetchMock.mock.calls, 'PATCH', '/api/expenses/e1')).toEqual({
      category: 'ENTERTAINMENT',
      note: '',
    });
  });

  it('deletes an expense, shows API errors, and Cancel closes', async () => {
    const fetchMock = fakeApi({
      ...november,
      'DELETE /api/expenses/e2': ok({ message: 'Expense not found' }, 404),
    });
    const user = userEvent.setup();
    renderApp('/expenses?month=2026-11');

    await user.click(await screen.findByRole('button', { name: /Receipt/ }));
    await user.click(screen.getByRole('button', { name: 'Delete expense' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Expense not found',
    );
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      ),
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Add expense', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

  it('types one in, checks it, saves it and goes to its month', async () => {
    const fetchMock = fakeApi({
      ...november,
      'POST /api/expenses': ok({}, 201),
    });
    const user = userEvent.setup();
    renderApp('/expenses/new?month=2026-11');

    expect(await screen.findByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/expenses?month=2026-11',
    );
    await user.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(screen.getByText('Enter an amount like 7.20')).toBeVisible();

    await user.type(screen.getByLabelText('Amount ($)'), '4.50');
    await user.selectOptions(screen.getByLabelText('Category'), 'GROCERIES');
    await user.type(screen.getByLabelText('Merchant'), 'FairPrice');
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), '2026-11-19');
    await user.click(screen.getByRole('button', { name: 'Save expense' }));

    expect(
      await screen.findByRole('heading', { name: 'Expenses' }),
    ).toBeInTheDocument();
    expect(sent(fetchMock.mock.calls, 'POST', '/api/expenses')).toEqual({
      amountCents: 450,
      category: 'GROCERIES',
      spentAt: '2026-11-19',
      merchant: 'FairPrice',
      source: 'MANUAL',
    });
  });

  it('scans a receipt into the form, then saves it as RECEIPT', async () => {
    let reply!: (r: { status: number; body: unknown }) => void;
    const fetchMock = fakeApi({
      ...november,
      'POST /api/expenses/receipt': new Promise((resolve) => (reply = resolve)),
      'POST /api/expenses': ok({}, 201),
    });
    const user = userEvent.setup();
    renderApp('/expenses/new?month=2026-11');

    const photo = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });
    await user.upload(await screen.findByLabelText('Scan a receipt'), photo);
    expect(await screen.findByText('Reading receipt…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled();

    reply(
      ok(
        {
          amountCents: 1290,
          merchant: 'Toast Box',
          category: 'FOOD_DRINKS',
          spentAt: '2026-11-18',
          categoryFrom: 'ai',
        },
        201,
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Read from your receipt',
    );
    expect(screen.getByLabelText('Amount ($)')).toHaveValue('12.90');
    expect(screen.getByLabelText('Merchant')).toHaveValue('Toast Box');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-18');
    expect(screen.getByText('Guessed from the receipt')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Save expense' }));
    await screen.findByRole('heading', { name: 'Expenses' });
    expect(sent(fetchMock.mock.calls, 'POST', '/api/expenses')).toMatchObject({
      amountCents: 1290,
      source: 'RECEIPT',
    });
  });

  it('keeps today when the receipt has no date, and shows scan errors', async () => {
    fakeApi({
      'GET /api/me': ok(chee),
      'POST /api/expenses/receipt': ok(
        {
          message: 'No amount found on this receipt. Add the expense by hand.',
        },
        422,
      ),
    });
    const user = userEvent.setup();
    renderApp('/expenses/new');

    const photo = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });
    await user.upload(await screen.findByLabelText('Scan a receipt'), photo);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No amount found on this receipt',
    );
    expect(screen.getByLabelText('Date')).toHaveValue(sgDay(new Date()));
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      `/expenses?month=${sgMonth()}`,
    );
  });
});

describe('Add expense: guessing the category (KAN-78)', () => {
  beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));
  const guessUrl = (merchant: string) =>
    `GET /api/expenses/category?merchant=${encodeURIComponent(merchant)}`;

  it('fills in what you picked last time once the merchant is typed', async () => {
    fakeApi({
      'GET /api/me': ok(chee),
      [guessUrl('Starbucks')]: ok({ category: 'GIFTS', from: 'memory' }),
      [guessUrl('Grab')]: ok({ category: 'TRANSPORT', from: 'rules' }),
    });
    const user = userEvent.setup();
    renderApp('/expenses/new');

    await user.type(await screen.findByLabelText('Merchant'), 'Starbucks');
    await user.tab();
    await waitFor(() =>
      expect(screen.getByLabelText('Category')).toHaveValue('GIFTS'),
    );
    expect(screen.getByText('Same as you picked last time')).toBeVisible();

    await user.clear(screen.getByLabelText('Merchant'));
    await user.type(screen.getByLabelText('Merchant'), 'Grab');
    await user.tab();
    await waitFor(() =>
      expect(screen.getByLabelText('Category')).toHaveValue('TRANSPORT'),
    );
    expect(screen.getByText('Guessed from the name')).toBeVisible();
  });

  it('never replaces a category you picked, and ignores no answer or an error', async () => {
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      [guessUrl('Ah Huat')]: ok({ category: 'OTHERS', from: 'none' }),
      [guessUrl('Kopi')]: ok({}, 500),
    });
    const user = userEvent.setup();
    renderApp('/expenses/new');

    const merchant = await screen.findByLabelText('Merchant');
    await user.type(merchant, 'Ah Huat');
    await user.tab();
    await user.clear(merchant);
    await user.type(merchant, 'Kopi');
    await user.tab();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/expenses/category?merchant=Kopi',
        expect.anything(),
      ),
    );
    expect(screen.getByLabelText('Category')).toHaveValue('FOOD_DRINKS');
    expect(screen.queryByRole('alert')).toBeNull();

    // Picked by hand: no more guesses
    fetchMock.mockClear();
    await user.selectOptions(screen.getByLabelText('Category'), 'HEALTH');
    await user.clear(merchant);
    await user.type(merchant, 'Starbucks');
    await user.tab();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Category')).toHaveValue('HEALTH');
  });
});

describe('dates and checks', () => {
  it('uses Singapore days and months', () => {
    // 00:30 on 1 Dec in Singapore is still 30 Nov in UTC
    expect(sgDay('2026-11-30T16:30:00Z')).toBe('2026-12-01');
    expect(sgMonth(new Date('2026-11-30T16:30:00Z'))).toBe('2026-12');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthLabel('2026-11')).toBe('Nov 2026');
    expect(dayLabel('2026-11-21')).toBe('Sat 21 Nov');
  });

  it('needs an amount above $0 and a date', () => {
    expect(validateExpense({ ...emptyForm(), amount: '0', date: '' })).toEqual({
      amount: 'Enter an amount like 7.20',
      date: 'Pick a date',
    });
    expect(validateExpense({ ...emptyForm(), amount: '7.2' })).toEqual({});
  });
});
