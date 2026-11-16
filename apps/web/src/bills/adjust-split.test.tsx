import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { guestStore } from './guest';

const ok = (body: unknown, status = 200) => ({ status, body });
const claim = (participantId: string, more: object = {}) => ({
  participantId,
  shares: 1,
  percentBp: null,
  exactCents: null,
  ...more,
});

// Ben (me) and Dan share the Tiger Beer; Ben has the Laksa alone
const bill = (tiger: object = {}) => ({
  title: 'Dinner at Maxwell',
  status: 'OPEN',
  owner: { displayName: 'Chee' },
  participants: [
    { id: 'p-ben', displayName: 'Ben' },
    { id: 'p-dan', displayName: 'Dan' },
  ],
  items: [
    {
      id: 'i2',
      name: 'Laksa',
      unitPriceCents: 750,
      quantity: 1,
      splitMode: 'EQUAL',
      claims: [claim('p-ben')],
    },
    {
      id: 'i3',
      name: 'Tiger Beer',
      unitPriceCents: 800,
      quantity: 2,
      splitMode: 'EQUAL',
      claims: [claim('p-ben'), claim('p-dan')],
      ...tiger,
    },
  ],
});
const summary = ok({ people: [{ participantId: 'p-ben', totalCents: 1858 }] });
const base = () => ({
  'GET /api/share/tok': ok(bill()),
  'GET /api/share/tok/summary': summary,
});
const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    await screen.findByRole('button', { name: 'Adjust split of Tiger Beer' }),
  );
  return screen.getByRole('dialog', { name: 'Split Tiger Beer' });
};

beforeEach(() =>
  guestStore.set('tok', { token: 'guest-jwt', participantId: 'p-ben' }),
);

describe('Adjust split', () => {
  it('is only offered on an item I share with someone', async () => {
    fakeApi(base());
    renderApp('/s/tok');
    expect(
      await screen.findByRole('button', { name: 'Adjust split of Tiger Beer' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Adjust split of Laksa' }),
    ).toBeNull();
  });

  it("70 / 30: can't be saved until it adds up to 100%, then sends basis points", async () => {
    const replies = {
      ...base(),
      'PATCH /api/share/tok/claims/i3': ok({}),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/s/tok');
    const sheet = within(await openSheet(user));

    expect(sheet.getByText('Split Tiger Beer ($16.00)')).toBeInTheDocument();
    expect(sheet.getByRole('status')).toHaveTextContent(
      '2 people pay the same',
    );

    await user.click(sheet.getByRole('button', { name: '%' }));
    const save = sheet.getByRole('button', { name: 'Save split' });
    expect(save).toBeDisabled();
    await user.type(sheet.getByLabelText('You %'), '60');
    await user.type(sheet.getByLabelText('Dan %'), '30');
    expect(sheet.getByRole('status')).toHaveTextContent('90%, need 100%');
    expect(save).toBeDisabled();

    await user.clear(sheet.getByLabelText('You %'));
    await user.type(sheet.getByLabelText('You %'), '70');
    expect(sheet.getByRole('status')).toHaveTextContent('Total 100% ✓');
    await user.click(save);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit).method === 'PATCH',
    )!;
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({
      splitMode: 'PERCENT',
      entries: [
        { participantId: 'p-ben', percentBp: 7000 },
        { participantId: 'p-dan', percentBp: 3000 },
      ],
    });
    expect((patch[1] as RequestInit).headers).toMatchObject({
      'X-Guest-Token': 'guest-jwt',
    });
  });

  it('shares start at 1 : 1 and exact amounts must add up to the price', async () => {
    const fetchMock = fakeApi({
      ...base(),
      'PATCH /api/share/tok/claims/i3': ok({}),
    });
    const user = userEvent.setup();
    renderApp('/s/tok');
    const sheet = within(await openSheet(user));

    await user.click(sheet.getByRole('button', { name: 'Shares' }));
    expect(sheet.getByLabelText('You shares')).toHaveValue('1');
    expect(sheet.getByRole('status')).toHaveTextContent('Shares 1 : 1');

    await user.click(sheet.getByRole('button', { name: 'Exact' }));
    await user.type(sheet.getByLabelText('You $'), '10');
    await user.type(sheet.getByLabelText('Dan $'), '5');
    expect(sheet.getByRole('status')).toHaveTextContent('$15.00, need $16.00');
    await user.type(sheet.getByLabelText('Dan $'), '.5');
    await user.clear(sheet.getByLabelText('Dan $'));
    await user.type(sheet.getByLabelText('Dan $'), '6');
    await user.click(sheet.getByRole('button', { name: 'Save split' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit).method === 'PATCH',
    )!;
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({
      splitMode: 'EXACT',
      entries: [
        { participantId: 'p-ben', exactCents: 1000 },
        { participantId: 'p-dan', exactCents: 600 },
      ],
    });
  });

  it('opens with what is already saved', async () => {
    fakeApi({
      ...base(),
      'GET /api/share/tok': ok(
        bill({
          splitMode: 'PERCENT',
          claims: [
            claim('p-ben', { percentBp: 7000 }),
            claim('p-dan', { percentBp: 3000 }),
          ],
        }),
      ),
    });
    const user = userEvent.setup();
    renderApp('/s/tok');
    const sheet = within(await openSheet(user));

    expect(sheet.getByRole('button', { name: '%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(sheet.getByLabelText('You %')).toHaveValue('70');
    expect(sheet.getByLabelText('Dan %')).toHaveValue('30');
  });

  it('opens saved shares and exact amounts too', async () => {
    const replies = {
      ...base(),
      'GET /api/share/tok': ok(
        bill({
          splitMode: 'EXACT',
          claims: [
            claim('p-ben', { shares: 2, exactCents: 1000 }),
            claim('p-dan', { exactCents: 600 }),
          ],
        }),
      ),
    };
    fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/s/tok');
    const sheet = within(await openSheet(user));
    expect(sheet.getByLabelText('You $')).toHaveValue('10.00');
    expect(sheet.getByRole('status')).toHaveTextContent('Total $16.00 ✓');
  });

  it('shows why the API refused, and Cancel closes the sheet', async () => {
    fakeApi({
      ...base(),
      'PATCH /api/share/tok/claims/i3': ok(
        { message: 'This bill is locked and can no longer be changed' },
        409,
      ),
    });
    const user = userEvent.setup();
    renderApp('/s/tok');
    const sheet = within(await openSheet(user));

    await user.click(sheet.getByRole('button', { name: 'Save split' }));
    expect(await sheet.findByRole('alert')).toHaveTextContent(
      'This bill is locked and can no longer be changed',
    );
    expect(sheet.getByRole('button', { name: 'Save split' })).toBeEnabled();

    await user.click(sheet.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Join with a code', () => {
  it('finds the bill by its code and opens it', async () => {
    const fetchMock = fakeApi({
      ...base(),
      'GET /api/join/K7P2Q': ok({ shareToken: 'tok' }),
    });
    const user = userEvent.setup();
    const router = renderApp('/join');

    await user.type(await screen.findByLabelText('Code'), 'k7p2q');
    expect(screen.getByLabelText('Code')).toHaveValue('K7P2Q');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(
      await screen.findByRole('heading', { name: 'Tap what you had' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/s/tok');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/join/K7P2Q');
  });

  it('checks the shape first, and says when no bill has that code', async () => {
    const fetchMock = fakeApi({
      'GET /api/join/ABCDE': ok({ message: 'No bill with this code' }, 404),
    });
    const user = userEvent.setup();
    renderApp('/join');

    await user.type(await screen.findByLabelText('Code'), 'K7P');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(
      screen.getByText('The code is 5 letters and numbers'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Code'));
    await user.type(screen.getByLabelText('Code'), 'ABCDE');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No bill with this code',
    );
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
  });

  it('is linked from the log in screen', async () => {
    fakeApi({});
    renderApp('/login');
    expect(
      await screen.findByRole('link', { name: 'Have a code? Join a bill' }),
    ).toHaveAttribute('href', '/join');
  });
});
