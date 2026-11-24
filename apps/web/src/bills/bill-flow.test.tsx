import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, renderApp } from '../test-utils';
import type { Bill } from './types';

// jsdom can't draw on a canvas, so the photo is passed through unchanged here.
// shrinkImage itself was tried in a real browser.
vi.mock('./image', () => ({ shrinkImage: async (file: File) => file }));

const chee = { id: 'u1', email: 'chee@example.com', displayName: 'Chee' };
const me = { 'GET /api/me': { status: 200, body: chee } };

// The brief's bill: 600 + 750 + 2 × 800 = 2950, +10% = 295, +9% = 292 → 3537
const dinner: Bill = {
  id: 'b1',
  title: 'Dinner at Maxwell',
  status: 'OPEN',
  serviceBp: 1000,
  gstBp: 900,
  shareToken: 'tok',
  joinCode: 'K7P2Q',
  participants: [],
  items: [
    { id: 'i1', name: 'Chicken Rice', unitPriceCents: 600, quantity: 1 },
    { id: 'i2', name: 'Laksa', unitPriceCents: 750, quantity: 1 },
    { id: 'i3', name: 'Tiger Beer', unitPriceCents: 800, quantity: 2 },
  ],
  totals: {
    subtotalCents: 2950,
    serviceCents: 295,
    gstCents: 292,
    totalCents: 3537,
  },
};
const ok = (body: unknown, status = 200) => ({ status, body });
const sentBody = (call: unknown[]) =>
  JSON.parse((call[1] as RequestInit).body as string);

beforeEach(() => localStorage.setItem('splitlah.token', 'jwt-1'));

describe('New bill', () => {
  it('asks for a name, then goes on to add items without creating the bill yet', async () => {
    const fetchMock = fakeApi(me);
    const user = userEvent.setup();
    const router = renderApp('/bills/new');

    await user.type(
      await screen.findByLabelText('What is this bill for?'),
      ' Dinner at Maxwell ',
    );
    await user.click(screen.getByRole('button', { name: 'Next: add items' }));

    expect(
      await screen.findByRole('heading', { name: 'Add items' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bills/new/scan');
    expect(router.state.location.state).toEqual({ title: 'Dinner at Maxwell' });
    // KAN-99: nothing is created until there is something to put in the bill
    expect(fetchMock).toHaveBeenCalledTimes(1); // only GET /me
  });

  it('needs a name', async () => {
    const fetchMock = fakeApi(me);
    const user = userEvent.setup();
    renderApp('/bills/new');

    await user.click(
      await screen.findByRole('button', { name: 'Next: add items' }),
    );
    expect(
      screen.getByText('Enter a name (up to 80 characters)'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only GET /me
  });
});

describe('Scan receipt', () => {
  const photo = new File(['fake photo'], 'IMG_0001.jpg', {
    type: 'image/jpeg',
  });
  const scanPage = {
    pathname: '/bills/new/scan',
    state: { title: 'Dinner at Maxwell' },
  };
  const created = { 'POST /api/bills': ok(dinner, 201) };
  const callsOf = (fetchMock: ReturnType<typeof fakeApi>) =>
    fetchMock.mock.calls.map(
      ([url, init]) => `${(init as RequestInit).method} ${url}`,
    );

  it('can pick a photo from the gallery instead of the camera (KAN-88)', async () => {
    fakeApi(me);
    const user = userEvent.setup();
    renderApp(scanPage);

    const camera = await screen.findByLabelText('Scan receipt');
    const gallery = screen.getByLabelText('Upload from Photos');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(gallery).not.toHaveAttribute('capture');

    await user.upload(gallery, photo);
    expect(screen.getByAltText('Your receipt')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Read receipt' }),
    ).toBeInTheDocument();
  });
  const draft = {
    items: dinner.items.map(({ id: _id, ...item }) => item),
    serviceBp: 1000,
    gstBp: 900,
    check: { receiptTotalCents: 3537 },
  };

  it('creates the bill, uploads the photo, saves what the AI read and shows it for checking', async () => {
    const fetchMock = fakeApi({
      ...me,
      ...created,
      'POST /api/bills/b1/receipt': ok(draft, 201),
      'POST /api/bills/b1/items': ok({}, 201),
      'PATCH /api/bills/b1': ok(dinner),
      'GET /api/bills/b1': ok(dinner),
    });
    const user = userEvent.setup();
    const router = renderApp(scanPage);

    await user.upload(await screen.findByLabelText('Scan receipt'), photo);
    expect(screen.getByAltText('Your receipt')).toHaveAttribute(
      'src',
      'blob:preview',
    );
    await user.click(screen.getByRole('button', { name: 'Read receipt' }));

    expect(
      await screen.findByRole('heading', { name: 'Check items' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bills/b1/edit');
    expect(
      await screen.findByText('Receipt says $35.37 ✓'),
    ).toBeInTheDocument();

    expect(callsOf(fetchMock)).toEqual([
      'GET /api/me',
      'POST /api/bills',
      'POST /api/bills/b1/receipt',
      'POST /api/bills/b1/items',
      'POST /api/bills/b1/items',
      'POST /api/bills/b1/items',
      'PATCH /api/bills/b1',
      'GET /api/bills/b1',
    ]);
    expect(sentBody(fetchMock.mock.calls[1])).toEqual({
      title: 'Dinner at Maxwell',
    });
    // The photo goes as a form upload, in the field the API expects
    const upload = (fetchMock.mock.calls[2][1] as RequestInit).body as FormData;
    expect(upload.get('image')).toBeInstanceOf(File);
    expect(sentBody(fetchMock.mock.calls[5])).toEqual({
      name: 'Tiger Beer',
      unitPriceCents: 800,
      quantity: 2,
    });
    expect(sentBody(fetchMock.mock.calls[6])).toEqual({
      serviceBp: 1000,
      gstBp: 900,
    });
  });

  it('shows "Reading receipt…" while the AI works', async () => {
    fakeApi({
      ...me,
      ...created,
      'POST /api/bills/b1/receipt': new Promise(() => {}),
    });
    const user = userEvent.setup();
    renderApp(scanPage);

    await user.upload(await screen.findByLabelText('Scan receipt'), photo);
    await user.click(screen.getByRole('button', { name: 'Read receipt' }));

    expect(
      await screen.findByRole('button', { name: 'Reading receipt…' }),
    ).toBeDisabled();
  });

  // KAN-99: a photo that isn't a receipt must not leave a bill behind
  it('says "No receipt found", removes the new bill and stays on the page', async () => {
    const fetchMock = fakeApi({
      ...me,
      ...created,
      'POST /api/bills/b1/receipt': ok(
        {
          message:
            'No receipt found in this photo. Try another photo, or add it by hand.',
        },
        422,
      ),
      'DELETE /api/bills/b1': ok(undefined, 204),
    });
    const user = userEvent.setup();
    const router = renderApp(scanPage);

    await user.upload(await screen.findByLabelText('Scan receipt'), photo);
    await user.click(screen.getByRole('button', { name: 'Read receipt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No receipt found in this photo',
    );
    expect(callsOf(fetchMock)).toEqual([
      'GET /api/me',
      'POST /api/bills',
      'POST /api/bills/b1/receipt',
      'DELETE /api/bills/b1',
    ]);
    expect(router.state.location.pathname).toBe('/bills/new/scan');
    // Try another photo, or type it in
    expect(screen.getByRole('button', { name: 'Read receipt' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Type it in' })).toBeEnabled();
  });

  it('still shows why the scan failed if removing the bill fails too', async () => {
    fakeApi({
      ...me,
      ...created,
      'POST /api/bills/b1/receipt': ok(
        { message: 'The receipt reader is not answering.' },
        503,
      ),
      'DELETE /api/bills/b1': ok({ message: 'boom' }, 500),
    });
    const user = userEvent.setup();
    renderApp(scanPage);

    await user.upload(await screen.findByLabelText('Scan receipt'), photo);
    await user.click(screen.getByRole('button', { name: 'Read receipt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The receipt reader is not answering.',
    );
  });

  it('"Type it in" creates the bill and opens it for typing the items', async () => {
    const fetchMock = fakeApi({
      ...me,
      ...created,
      'GET /api/bills/b1': ok({ ...dinner, items: [] }),
    });
    const user = userEvent.setup();
    const router = renderApp(scanPage);

    await user.click(await screen.findByRole('button', { name: 'Type it in' }));

    expect(
      await screen.findByRole('heading', { name: 'Check items' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bills/b1/edit');
    expect(sentBody(fetchMock.mock.calls[1])).toEqual({
      title: 'Dinner at Maxwell',
    });
  });

  it('shows an API error in words when the bill cannot be created', async () => {
    fakeApi({
      ...me,
      'POST /api/bills': ok({ message: 'Too Many Requests' }, 429),
    });
    const user = userEvent.setup();
    renderApp(scanPage);

    await user.click(await screen.findByRole('button', { name: 'Type it in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many tries. Wait a minute and try again.',
    );
    expect(screen.getByRole('button', { name: 'Type it in' })).toBeEnabled();
  });

  it('goes back to naming the bill when opened without a name', async () => {
    fakeApi(me);
    const router = renderApp('/bills/new/scan');
    expect(
      await screen.findByLabelText('What is this bill for?'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bills/new');
  });

  it('does nothing when the camera is cancelled', async () => {
    fakeApi(me);
    const user = userEvent.setup();
    renderApp(scanPage);

    await user.upload(await screen.findByLabelText('Scan receipt'), []);
    expect(
      screen.queryByRole('button', { name: 'Read receipt' }),
    ).not.toBeInTheDocument();
  });
});

describe('Check items', () => {
  it('shows the items and the totals worked out by the API', async () => {
    fakeApi({ ...me, 'GET /api/bills/b1': ok(dinner) });
    renderApp('/bills/b1/edit');

    const beer = await screen.findByRole('button', { name: 'Edit Tiger Beer' });
    expect(beer).toHaveTextContent('2 × $8.00');
    expect(beer).toHaveTextContent('$16.00');
    const totals = screen.getByText('Our total').closest('dl')!;
    expect(totals).toHaveTextContent('Subtotal$29.50');
    expect(totals).toHaveTextContent('Service charge$2.95');
    expect(totals).toHaveTextContent('GST$2.92');
    expect(totals).toHaveTextContent('Our total$35.37');
    // Not from a scan, so there is no receipt total to compare with
    expect(screen.queryByText(/Receipt says/)).not.toBeInTheDocument();
  });

  it('adds an item typed in dollars as cents', async () => {
    const replies = {
      ...me,
      'GET /api/bills/b1': ok({ ...dinner, items: [] }),
      'POST /api/bills/b1/items': ok({}, 201),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/bills/b1/edit');

    await user.click(await screen.findByRole('button', { name: '+ Add item' }));
    await user.type(screen.getByLabelText('Item'), 'Teh Tarik');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.type(screen.getByLabelText('Price each ($)'), '12.5');
    replies['GET /api/bills/b1'] = ok(dinner); // what the API has after saving
    await user.click(screen.getByRole('button', { name: 'Save item' }));

    expect(
      await screen.findByRole('button', { name: 'Edit Laksa' }),
    ).toBeInTheDocument();
    expect(sentBody(fetchMock.mock.calls[2])).toEqual({
      name: 'Teh Tarik',
      quantity: 2,
      unitPriceCents: 1250,
    });
    expect(screen.queryByLabelText('Item')).not.toBeInTheDocument(); // form closed
  });

  it('checks an item before sending it, and Cancel closes the form', async () => {
    const fetchMock = fakeApi({ ...me, 'GET /api/bills/b1': ok(dinner) });
    const user = userEvent.setup();
    renderApp('/bills/b1/edit');

    await user.click(await screen.findByRole('button', { name: '+ Add item' }));
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '0');
    await user.type(screen.getByLabelText('Price each ($)'), 'free');
    await user.click(screen.getByRole('button', { name: 'Save item' }));

    expect(
      screen.getByText('Enter a name (up to 80 characters)'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 to 999')).toBeInTheDocument();
    expect(screen.getByText('A price like 12.50')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2); // GET /me and GET the bill only

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Item')).not.toBeInTheDocument();
  });

  it('edits an item, starting from what is saved', async () => {
    const fetchMock = fakeApi({
      ...me,
      'GET /api/bills/b1': ok(dinner),
      'PATCH /api/bills/b1/items/i2': ok({}),
    });
    const user = userEvent.setup();
    renderApp('/bills/b1/edit');

    await user.click(await screen.findByRole('button', { name: 'Edit Laksa' }));
    expect(screen.getByLabelText('Item')).toHaveValue('Laksa');
    expect(screen.getByLabelText('Price each ($)')).toHaveValue('7.50');
    await user.clear(screen.getByLabelText('Price each ($)'));
    await user.type(screen.getByLabelText('Price each ($)'), '8');
    await user.click(screen.getByRole('button', { name: 'Save item' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(sentBody(fetchMock.mock.calls[2])).toEqual({
      name: 'Laksa',
      quantity: 1,
      unitPriceCents: 800,
    });

    await user.click(await screen.findByRole('button', { name: 'Edit Laksa' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Item')).not.toBeInTheDocument();
  });

  it('deletes an item', async () => {
    const fetchMock = fakeApi({
      ...me,
      'GET /api/bills/b1': ok(dinner),
      'DELETE /api/bills/b1/items/i1': { status: 204 },
    });
    const user = userEvent.setup();
    renderApp('/bills/b1/edit');

    await user.click(
      await screen.findByRole('button', { name: 'Edit Chicken Rice' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete item' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[2][0]).toBe('/api/bills/b1/items/i1');
  });

  it('switches a charge off and on, and saves a typed rate', async () => {
    const replies = {
      ...me,
      'GET /api/bills/b1': ok(dinner),
      'PATCH /api/bills/b1': ok(dinner),
    };
    const fetchMock = fakeApi(replies);
    const user = userEvent.setup();
    renderApp('/bills/b1/edit');

    // A hawker bill: no service charge
    const service = await screen.findByLabelText('Service charge');
    replies['GET /api/bills/b1'] = ok({ ...dinner, serviceBp: 0 });
    await user.click(service);
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Service charge rate in percent'),
      ).not.toBeInTheDocument(),
    );
    expect(sentBody(fetchMock.mock.calls[2])).toEqual({ serviceBp: 0 });

    // Back on: starts at the usual 10%
    replies['GET /api/bills/b1'] = ok(dinner);
    await user.click(screen.getByLabelText('Service charge'));
    expect(
      await screen.findByLabelText('Service charge rate in percent'),
    ).toHaveValue('10');
    expect(sentBody(fetchMock.mock.calls[4])).toEqual({ serviceBp: 1000 });

    // An older receipt with 8% GST; a rate that isn't a number is not sent
    const gst = screen.getByLabelText('GST rate in percent');
    await user.clear(gst);
    await user.type(gst, 'lots');
    await user.tab();
    expect(gst).toHaveAttribute('aria-invalid', 'true');
    await user.clear(gst);
    await user.type(gst, '8');
    await user.tab();
    await waitFor(() =>
      expect(sentBody(fetchMock.mock.calls[6])).toEqual({ gstBp: 800 }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('leaving a rate unchanged sends nothing', async () => {
    const fetchMock = fakeApi({ ...me, 'GET /api/bills/b1': ok(dinner) });
    const user = userEvent.setup();
    renderApp('/bills/b1/edit');

    await user.click(await screen.findByLabelText('GST rate in percent'));
    await user.tab();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows why a change was refused and keeps the form open', async () => {
    fakeApi({
      ...me,
      'GET /api/bills/b1': ok(dinner),
      'DELETE /api/bills/b1/items/i1': ok(
        { message: 'This bill is locked and can no longer be changed' },
        409,
      ),
    });
    const user = userEvent.setup();
    renderApp('/bills/b1/edit');

    await user.click(
      await screen.findByRole('button', { name: 'Edit Chicken Rice' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete item' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This bill is locked and can no longer be changed',
    );
    expect(screen.getByLabelText('Item')).toBeInTheDocument();
  });

  it("says so when the bill can't be loaded", async () => {
    fakeApi({
      ...me,
      'GET /api/bills/nope': ok({ message: 'Bill not found' }, 404),
    });
    renderApp('/bills/nope/edit');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bill not found',
    );
  });
});

describe('Receipt total check (after a scan)', () => {
  const open = (receiptTotalCents: number | null) => {
    fakeApi({ ...me, 'GET /api/bills/b1': ok(dinner) });
    return renderApp({
      pathname: '/bills/b1/edit',
      state: { receiptTotalCents },
    });
  };

  it('warns when our total and the receipt disagree', async () => {
    open(3600);
    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent(
      'Receipt says $36.00, but our total is $35.37. Check the items and charges.',
    );
  });

  it('shows a tick when they agree', async () => {
    open(3537);
    expect(
      await screen.findByText('Receipt says $35.37 ✓'),
    ).toBeInTheDocument();
  });

  it('shows nothing when the receipt had no readable total', async () => {
    open(null);
    await screen.findByText('Our total');
    expect(screen.queryByText(/Receipt says/)).not.toBeInTheDocument();
    expect(within(document.body).queryByRole('alert')).not.toBeInTheDocument();
  });
});
