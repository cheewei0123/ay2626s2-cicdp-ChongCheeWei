import type { ClaimsService } from './claims.service.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';
import { JoinController, ShareController } from './share.controller.js';
import type { ShareService } from './share.service.js';
import type { SummaryService } from './summary.service.js';

// Fake services: the controllers should only pass work on to them
const share = { view: vi.fn(), join: vi.fn(), shareTokenFor: vi.fn() };
const claims = { claim: vi.fn(), unclaim: vi.fn(), setSplit: vi.fn() };
const summary = { forBill: vi.fn() };
const controller = new ShareController(
  share as unknown as ShareService,
  claims as unknown as ClaimsService,
  summary as unknown as SummaryService,
);
const bill: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };
const guest = { participantId: 'p1', billId: 'b1' };

describe('ShareController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows the bill found by the share token', async () => {
    await controller.view(bill);
    expect(share.view).toHaveBeenCalledWith('b1');
  });

  it("gives guests the summary with the owner's PayNow number", async () => {
    await controller.getSummary(bill);
    expect(summary.forBill).toHaveBeenCalledWith('b1', { withPaynow: true });
  });

  it('joins with the name from the body', async () => {
    await controller.join(bill, { displayName: 'Ben' });
    expect(share.join).toHaveBeenCalledWith(bill, 'Ben');
  });

  it('claims and unclaims as the guest from the guest token', async () => {
    await controller.claim(bill, guest, { itemId: 'i1', shares: 2 });
    await controller.unclaim(bill, guest, 'i1');
    expect(claims.claim).toHaveBeenCalledWith(bill, 'p1', 'i1', 2);
    expect(claims.unclaim).toHaveBeenCalledWith(bill, 'p1', 'i1');
  });

  it('changes an item split as the guest', async () => {
    const dto = {
      splitMode: 'EQUAL' as const,
      entries: [{ participantId: 'p1' }],
    };
    await controller.setSplit(bill, guest, 'i1', dto);
    expect(claims.setSplit).toHaveBeenCalledWith(bill, 'i1', dto, 'p1');
  });
});

describe('JoinController', () => {
  it('looks up the code from the URL', async () => {
    await new JoinController(share as unknown as ShareService).find('K7P2Q');
    expect(share.shareTokenFor).toHaveBeenCalledWith('K7P2Q');
  });
});
