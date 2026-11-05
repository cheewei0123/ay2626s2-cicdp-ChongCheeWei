import type { OwnedBill } from './guards/bill-owner.guard.js';
import { JoinController, ShareController } from './share.controller.js';
import type { ShareService } from './share.service.js';

// A fake ShareService: the controllers should only pass work on to it
const share = { view: vi.fn(), join: vi.fn(), shareTokenFor: vi.fn() };
const service = share as unknown as ShareService;
const bill: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };

describe('ShareController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows the bill found by the share token', async () => {
    await new ShareController(service).view(bill);
    expect(share.view).toHaveBeenCalledWith('b1');
  });

  it('joins with the name from the body', async () => {
    await new ShareController(service).join(bill, { displayName: 'Ben' });
    expect(share.join).toHaveBeenCalledWith(bill, 'Ben');
  });
});

describe('JoinController', () => {
  it('looks up the code from the URL', async () => {
    await new JoinController(service).find('K7P2Q');
    expect(share.shareTokenFor).toHaveBeenCalledWith('K7P2Q');
  });
});
