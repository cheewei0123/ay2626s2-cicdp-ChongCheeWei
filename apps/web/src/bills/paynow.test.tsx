import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import { guestStore } from './guest';
import { formatMobile } from './money';

const ok = (body: unknown, status = 200) => ({ status, body });

// Ben's view of the brief's bill: he owes $9.59 to Chee
const bill = (status: string) => ({
  title: 'Dinner at Maxwell',
  status,
  owner: { displayName: 'Chee' },
  participants: [],
  items: [],
});
const ben = (more: object = {}) => ({
  participantId: 'p-ben',
  displayName: 'Ben',
  isOwner: false,
  itemsCents: 800,
  serviceCents: 80,
  gstCents: 79,
  totalCents: 959,
  paid: false,
  paynowPayload: '00020101021226370009SG.PAYNOW-fake',
  ...more,
});
const summary = (person: object, mobile: string | null = '+6591234567') => ({
  subtotalCents: 800,
  serviceCents: 80,
  gstCents: 79,
  totalCents: 959,
  unclaimedCents: 0,
  people: [person],
  paynow: { mobile, name: 'Chee' },
});

async function openSummaryTab(status: string, body: object) {
  fakeApi({
    'GET /api/share/tok': ok(bill(status)),
    'GET /api/share/tok/summary': ok(body),
  });
  const user = userEvent.setup();
  renderApp('/s/tok');
  await user.click(await screen.findByRole('tab', { name: 'Summary' }));
  return user;
}

describe('Paying the owner back by PayNow (guest Summary tab)', () => {
  beforeEach(() =>
    guestStore.set('tok', { token: 'guest-jwt', participantId: 'p-ben' }),
  );

  it('shows a QR for my exact amount once the bill is locked, with copy buttons', async () => {
    const user = await openSummaryTab('LOCKED', summary(ben()));

    const pay = within(screen.getByRole('region', { name: 'Pay by PayNow' }));
    expect(pay.getByText('Pay Chee by PayNow')).toBeInTheDocument();
    expect(pay.getByText('$9.59')).toBeInTheDocument();
    expect(
      pay.getByTitle('PayNow QR code to pay Chee $9.59'),
    ).toBeInTheDocument();
    expect(pay.getByText(/never moves money/)).toBeInTheDocument();

    await user.click(pay.getByRole('button', { name: 'Copy number' }));
    expect(await navigator.clipboard.readText()).toBe('+6591234567');
    expect(pay.getByRole('status')).toHaveTextContent('Copied +65 9123 4567');

    await user.click(pay.getByRole('button', { name: 'Copy amount' }));
    expect(await navigator.clipboard.readText()).toBe('9.59');
    expect(pay.getByRole('status')).toHaveTextContent('Copied 9.59');
  });

  it('waits for the owner to lock the bill before showing a QR', async () => {
    await openSummaryTab('OPEN', summary(ben()));
    expect(
      screen.getByText('Your PayNow QR appears here once Chee locks the bill.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pay by PayNow' })).toBeNull();
  });

  it("says so when the owner hasn't added a PayNow number", async () => {
    await openSummaryTab('LOCKED', summary(ben({ paynowPayload: null }), null));
    expect(
      screen.getByText(
        "Chee hasn't added a checked PayNow number yet. Ask them how to pay $9.59.",
      ),
    ).toBeInTheDocument();
  });

  it('shows when the owner has marked me as paid', async () => {
    await openSummaryTab('LOCKED', summary(ben({ paid: true })));
    expect(screen.getByText('Chee marked you as paid ✓')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pay by PayNow' })).toBeNull();
  });

  it('shows nothing to pay when I owe nothing', async () => {
    await openSummaryTab(
      'LOCKED',
      summary(ben({ totalCents: 0, paynowPayload: null })),
    );
    expect(screen.queryByText(/PayNow/)).toBeNull();
  });
});

describe('formatMobile', () => {
  it('groups a Singapore number in fours', () => {
    expect(formatMobile('+6591234567')).toBe('+65 9123 4567');
  });
});
