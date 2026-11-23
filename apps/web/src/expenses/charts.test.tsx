import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { columnsOf, slicesOf } from './chart';
import {
  addDays,
  lastDayOf,
  monthGrid,
  periodFrom,
  periodLabel,
  periodQuery,
  presets,
} from './dates';
import type { Category, MonthSummary } from './types';

// KAN-94: the calendar range picker and the bars / pie / over-time chart

const ok = (body: unknown, status = 200) => ({ status, body });
const chee = {
  id: 'u1',
  email: 'chee@example.com',
  displayName: 'Chee',
  emailVerifiedAt: '2026-11-01T00:00:00.000Z',
  paynowMobile: '+6591234567',
};
const summary = (
  lines: [Category, number][],
  byDay: MonthSummary['byDay'] = [],
): MonthSummary => ({
  totalCents: lines.reduce((sum, [, cents]) => sum + cents, 0),
  byCategory: lines.map(([category, totalCents]) => ({
    category,
    totalCents,
    count: 1,
  })),
  byDay,
});
const november = summary(
  [
    ['TRANSPORT', 1600],
    ['FOOD_DRINKS', 1400],
  ],
  [
    { day: '2026-11-20', totalCents: 1600 },
    { day: '2026-11-21', totalCents: 1400 },
  ],
);
const replies = (query: string, body: MonthSummary = november) => ({
  [`GET /api/expenses?${query}&pageSize=100`]: ok({ totalCount: 0, items: [] }),
  [`GET /api/expenses/summary?${query}`]: ok(body),
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('splitlah.token', 'jwt-1');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Expenses chart: bars, pie, over time', () => {
  it('switches between the three views and remembers the last one', async () => {
    fakeApi({ 'GET /api/me': ok(chee), ...replies('month=2026-11') });
    const user = userEvent.setup();
    renderApp('/expenses?month=2026-11');

    const tabs = await screen.findByRole('tablist', { name: 'Chart type' });
    expect(within(tabs).getByRole('tab', { name: 'Bars' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('list', { name: 'Spending by category' }),
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Pie' }));
    expect(
      screen.getByRole('img', {
        name: 'Pie chart: Transport 53%, Food & drinks 47%',
      }),
    ).toBeVisible();
    const legend = within(
      screen.getByRole('list', { name: 'Spending by category' }),
    ).getAllByRole('listitem');
    expect(legend.map((l) => l.textContent)).toEqual([
      '🚇 Transport$16.0053%',
      '🍜 Food & drinks$14.0047%',
    ]);
    expect(localStorage.getItem('splitlah.chart')).toBe('pie');

    await user.click(screen.getByRole('tab', { name: 'Over time' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Biggest day: Fri 20 Nov$16.00',
    );
    expect(localStorage.getItem('splitlah.chart')).toBe('time');
  });

  it('opens on the view picked last time', async () => {
    localStorage.setItem('splitlah.chart', 'pie');
    fakeApi({ 'GET /api/me': ok(chee), ...replies('month=2026-11') });
    renderApp('/expenses?month=2026-11');

    expect(await screen.findByRole('tab', { name: 'Pie' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('starts on Bars when the phone has nothing saved, or storage is off', async () => {
    localStorage.setItem('splitlah.chart', 'nonsense');
    const blocked = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('private mode');
      });
    fakeApi({ 'GET /api/me': ok(chee), ...replies('month=2026-11') });
    const user = userEvent.setup();
    renderApp('/expenses?month=2026-11');

    expect(await screen.findByRole('tab', { name: 'Bars' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Pie' })); // still switches
    expect(screen.getByRole('tab', { name: 'Pie' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    blocked.mockRestore();

    // Reading the saved view fails too: still Bars, and nothing breaks
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === 'splitlah.chart') throw new Error('private mode');
      return read.call(this, key);
    });
    cleanup();
    renderApp('/expenses?month=2026-11');
    expect(await screen.findByRole('tab', { name: 'Bars' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('pie: shows the slice under your finger in the middle', async () => {
    localStorage.setItem('splitlah.chart', 'pie');
    fakeApi({ 'GET /api/me': ok(chee), ...replies('month=2026-11') });
    renderApp('/expenses?month=2026-11');

    const ring = await screen.findByRole('img', { name: /Pie chart/ });
    expect(ring.parentElement).toHaveTextContent('53%Transport');
    fireEvent.mouseEnter(ring.querySelectorAll('circle')[1]);
    expect(ring.parentElement).toHaveTextContent('47%Food & drinks');
  });

  it('over time: hover, tap or the arrow keys pick a day', async () => {
    localStorage.setItem('splitlah.chart', 'time');
    fakeApi({ 'GET /api/me': ok(chee), ...replies('month=2026-11') });
    renderApp('/expenses?month=2026-11');

    const chart = await screen.findByRole('img', { name: /Spending by day/ });
    const readout = () => screen.getByRole('tabpanel').querySelector('p');
    const slots = chart.querySelectorAll('rect');
    expect(slots).toHaveLength(30); // every day of November

    fireEvent.mouseEnter(slots[20]);
    expect(readout()).toHaveTextContent('Sat 21 Nov$14.00');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(readout()).toHaveTextContent('Fri 20 Nov$16.00');
    fireEvent.keyDown(chart, { key: 'Enter' }); // not an arrow: nothing moves
    expect(readout()).toHaveTextContent('Fri 20 Nov');
    fireEvent.click(slots[0]);
    expect(readout()).toHaveTextContent('Sun 1 Nov$0.00');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // stays on the first day
    expect(readout()).toHaveTextContent('Sun 1 Nov');
  });

  it('hides the chart when nothing was spent', async () => {
    fakeApi({
      'GET /api/me': ok(chee),
      ...replies('month=2026-11', summary([])),
    });
    renderApp('/expenses?month=2026-11');

    expect(await screen.findByRole('region', { name: 'Total' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Spending chart' })).toBeNull();
  });
});

describe('Expenses: choosing dates on the calendar', () => {
  // 23 Nov 2026, 10am in Singapore
  const now = () =>
    vi.useFakeTimers({
      now: new Date('2026-11-23T02:00:00.000Z'),
      toFake: ['Date'],
    });

  it('a quick pick shows those days, and ‹ › step by the same length', async () => {
    now();
    const fetchMock = fakeApi({
      'GET /api/me': ok(chee),
      ...replies('month=2026-11'),
      ...replies('from=2026-11-17&to=2026-11-23'),
      ...replies('from=2026-11-10&to=2026-11-16'),
    });
    const user = userEvent.setup();
    renderApp('/expenses?month=2026-11');

    await user.click(await screen.findByRole('button', { name: 'Nov 2026' }));
    const sheet = screen.getByRole('dialog', { name: 'Choose dates' });
    expect(
      within(sheet).getByRole('button', { name: 'This month' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(
      within(sheet).getByRole('button', { name: 'Last 7 days' }),
    );

    expect(
      await screen.findByRole('heading', { name: '17 – 23 Nov 2026' }),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Previous days' }));
    expect(
      await screen.findByRole('heading', { name: '10 – 16 Nov 2026' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/expenses/summary?from=2026-11-10&to=2026-11-16',
        expect.anything(),
      ),
    );
    // Add expense goes to the month of the range's last day
    expect(screen.getByRole('link', { name: '+ Add expense' })).toHaveAttribute(
      'href',
      '/expenses/new?month=2026-11',
    );
  });

  it('picks any first and last day, across months', async () => {
    now();
    fakeApi({
      'GET /api/me': ok(chee),
      ...replies('month=2026-11'),
      ...replies('from=2026-10-28&to=2026-11-03'),
    });
    const user = userEvent.setup();
    renderApp('/expenses?month=2026-11');

    await user.click(await screen.findByRole('button', { name: 'Nov 2026' }));
    const sheet = screen.getByRole('dialog', { name: 'Choose dates' });
    const status = within(sheet).getByRole('status');
    const show = within(sheet).getByRole('button', { name: 'Show these days' });
    expect(status).toHaveTextContent('Tap the first day');
    expect(show).toBeDisabled();
    expect(
      within(sheet).getByRole('button', { name: 'Mon 23 Nov' }),
    ).toHaveAttribute('aria-current', 'date');

    await user.click(
      within(sheet).getByRole('button', { name: 'Show the month before' }),
    );
    expect(within(sheet).getByText('Oct 2026')).toBeVisible();
    await user.click(within(sheet).getByRole('button', { name: 'Wed 28 Oct' }));
    expect(status).toHaveTextContent('Now tap the last day');
    await user.click(
      within(sheet).getByRole('button', { name: 'Show the month after' }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Tue 3 Nov' }));
    expect(status).toHaveTextContent('28 Oct – 3 Nov 2026 · 7 days');
    expect(
      within(sheet).getByRole('button', { name: 'Tue 3 Nov' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(show);
    expect(
      await screen.findByRole('heading', { name: '28 Oct – 3 Nov 2026' }),
    ).toBeVisible();
  });

  it('one day, starting again, a range too long, and closing the sheet', async () => {
    now();
    fakeApi({
      'GET /api/me': ok(chee),
      ...replies('from=2026-11-10&to=2026-11-12'),
      ...replies('from=2026-11-05&to=2026-11-05'),
    });
    const user = userEvent.setup();
    renderApp('/expenses?from=2026-11-10&to=2026-11-12');

    await user.click(
      await screen.findByRole('button', { name: '10 – 12 Nov 2026' }),
    );
    let sheet = screen.getByRole('dialog', { name: 'Choose dates' });
    const status = within(sheet).getByRole('status');
    // It opens on the range shown, so a tap starts a new one
    expect(status).toHaveTextContent('10 – 12 Nov 2026 · 3 days');
    await user.click(within(sheet).getByRole('button', { name: 'Thu 5 Nov' }));
    await user.click(within(sheet).getByRole('button', { name: 'Thu 5 Nov' }));
    expect(status).toHaveTextContent('5 Nov 2026 · 1 day');
    // Tapping before the first day moves the first day
    await user.click(within(sheet).getByRole('button', { name: 'Sun 1 Nov' }));
    await user.click(within(sheet).getByRole('button', { name: 'Thu 5 Nov' }));
    expect(status).toHaveTextContent('1 – 5 Nov 2026 · 5 days');
    await user.click(within(sheet).getByRole('button', { name: 'Thu 5 Nov' }));
    await user.click(within(sheet).getByRole('button', { name: 'Sun 1 Nov' }));
    expect(status).toHaveTextContent('Now tap the last day');

    // More than 366 days can't be shown
    for (let i = 0; i < 13; i++)
      await user.click(
        within(sheet).getByRole('button', { name: 'Show the month after' }),
      );
    await user.click(
      within(sheet).getByRole('button', { name: /^Fri 3 Dec$/ }),
    );
    expect(status).toHaveTextContent("That's 398 days. Pick 366 or fewer.");
    expect(
      within(sheet).getByRole('button', { name: 'Show these days' }),
    ).toBeDisabled();

    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: '10 – 12 Nov 2026' }));
    sheet = screen.getByRole('dialog', { name: 'Choose dates' });
    fireEvent.keyDown(sheet, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('dates and chart maths', () => {
  it('reads the period from the address bar, falling back to the month', () => {
    const read = (q: string) => periodFrom(new URLSearchParams(q));
    expect(read('from=2026-11-03&to=2026-11-09')).toEqual({
      from: '2026-11-03',
      to: '2026-11-09',
    });
    expect(read('month=2026-10')).toEqual({ month: '2026-10' });
    expect(read('from=2026-11-09&to=2026-11-03&month=2026-10')).toEqual({
      month: '2026-10',
    });
    expect(read('from=junk&to=2026-11-03&month=2026-10')).toEqual({
      month: '2026-10',
    });
    expect(periodQuery({ from: '2026-11-03', to: '2026-11-09' })).toBe(
      'from=2026-11-03&to=2026-11-09',
    );
  });

  it('labels a month, a day, a range in one month, across months and across years', () => {
    expect(periodLabel({ month: '2026-11' })).toBe('Nov 2026');
    expect(periodLabel({ from: '2026-11-21', to: '2026-11-21' })).toBe(
      '21 Nov 2026',
    );
    expect(periodLabel({ from: '2026-11-03', to: '2026-11-09' })).toBe(
      '3 – 9 Nov 2026',
    );
    expect(periodLabel({ from: '2026-11-28', to: '2026-12-04' })).toBe(
      '28 Nov – 4 Dec 2026',
    );
    expect(periodLabel({ from: '2026-12-28', to: '2027-01-03' })).toBe(
      '28 Dec 2026 – 3 Jan 2027',
    );
  });

  it('counts days, months and quick picks in plain dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
    expect(presets('2026-01-05').map((p) => p.period)).toEqual([
      { month: '2026-01' },
      { month: '2025-12' },
      { from: '2025-12-30', to: '2026-01-05' },
      { from: '2025-12-07', to: '2026-01-05' },
    ]);
  });

  it('lays a month out in Monday-first weeks', () => {
    const weeks = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      '2026-11-01',
    ]);
    expect(weeks[5]).toEqual([
      '2026-11-30',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it('pie: 5 slices of their own, then one grey slice for the rest', () => {
    const seven = summary([
      ['FOOD_DRINKS', 400],
      ['GROCERIES', 200],
      ['TRANSPORT', 100],
      ['SHOPPING', 100],
      ['GIFTS', 100],
      ['HEALTH', 50],
      ['TRAVEL', 50],
    ]);
    const slices = slicesOf(seven);
    expect(slices.map((s) => [s.label, s.rank, s.percent])).toEqual([
      ['Food & drinks', 0, 40],
      ['Groceries', 1, 20],
      ['Transport', 2, 10],
      ['Shopping', 3, 10],
      ['Gifts', 4, 10],
      ['2 more', null, 10],
    ]);
    expect(slices.map((s) => Math.round(s.before * 10) / 10)).toEqual([
      0, 0.4, 0.6, 0.7, 0.8, 0.9,
    ]);

    // Exactly one left over keeps its own name, still grey
    const six = slicesOf(
      summary(
        seven.byCategory.slice(0, 6).map((l) => [l.category, l.totalCents]),
      ),
    );
    expect(six.at(-1)).toMatchObject({ label: 'Health', rank: null });
  });

  it('columns: one per day up to a month, one per month for longer', () => {
    const week = columnsOf({ from: '2026-11-03', to: '2026-11-09' }, [
      { day: '2026-11-05', totalCents: 300 },
    ]);
    expect(week.unit).toBe('day');
    expect(week.columns.map((c) => c.totalCents)).toEqual([
      0, 0, 300, 0, 0, 0, 0,
    ]);

    const quarter = columnsOf({ from: '2026-09-15', to: '2026-11-20' }, [
      { day: '2026-09-15', totalCents: 100 },
      { day: '2026-09-30', totalCents: 50 },
      { day: '2026-11-20', totalCents: 200 },
    ]);
    expect(quarter).toEqual({
      unit: 'month',
      columns: [
        { key: '2026-09', label: 'Sep', totalCents: 150 },
        { key: '2026-10', label: 'Oct', totalCents: 0 },
        { key: '2026-11', label: 'Nov', totalCents: 200 },
      ],
    });
  });
});
