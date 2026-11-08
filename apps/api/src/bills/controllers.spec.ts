import { BillsController } from './bills.controller.js';
import type { BillsService } from './bills.service.js';
import type { ClaimsService } from './claims.service.js';
import type { SummaryService } from './summary.service.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';
import { ItemsController } from './items.controller.js';

// A fake BillsService: the controllers should pass on the user or the guard-checked bill
const bills = {
  create: vi.fn(),
  listMine: vi.fn(),
  getDetails: vi.fn(),
  update: vi.fn(),
  addItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
};
const service = bills as unknown as BillsService;
const claims = {
  lock: vi.fn(),
  unlock: vi.fn(),
  claim: vi.fn(),
  unclaim: vi.fn(),
  ownerParticipantId: vi.fn(),
};
const claimsService = claims as unknown as ClaimsService;
const summary = { forBill: vi.fn() };
const summaryService = summary as unknown as SummaryService;
const user = { id: 'u1', email: 'chee@example.com' };
const bill: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };
const newBillsController = () =>
  new BillsController(service, claimsService, summaryService);

describe('BillsController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes lock and unlock to ClaimsService', async () => {
    const controller = newBillsController();
    await controller.lock(bill);
    await controller.unlock(bill);
    expect(claims.lock).toHaveBeenCalledWith(bill);
    expect(claims.unlock).toHaveBeenCalledWith(bill);
  });

  it('gives the owner the summary', async () => {
    await newBillsController().getSummary(bill);
    expect(summary.forBill).toHaveBeenCalledWith('b1');
  });

  it("claims and unclaims as the owner's own participant", async () => {
    claims.ownerParticipantId.mockResolvedValue('p-chee');
    const controller = newBillsController();
    await controller.claim(bill, { itemId: 'i1' });
    await controller.unclaim(bill, 'i1');
    expect(claims.claim).toHaveBeenCalledWith(bill, 'p-chee', 'i1', undefined);
    expect(claims.unclaim).toHaveBeenCalledWith(bill, 'p-chee', 'i1');
  });

  it('passes the user or the bill on', async () => {
    const controller = newBillsController();
    await controller.create(user, { title: 'Dinner' });
    await controller.listMine(user);
    await controller.getDetails(bill);
    await controller.update(bill, { title: 'New' });

    expect(bills.create).toHaveBeenCalledWith('u1', { title: 'Dinner' });
    expect(bills.listMine).toHaveBeenCalledWith('u1');
    expect(bills.getDetails).toHaveBeenCalledWith('b1');
    expect(bills.update).toHaveBeenCalledWith(bill, { title: 'New' });
  });
});

describe('ItemsController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('lets the owner change an item split (guestId null = owner)', async () => {
    const claimsMock = { setSplit: vi.fn() };
    const controller = new ItemsController(
      service,
      claimsMock as unknown as ClaimsService,
    );
    const dto = {
      splitMode: 'EQUAL' as const,
      entries: [{ participantId: 'p1' }],
    };
    await controller.setSplit(bill, 'i1', dto);
    expect(claimsMock.setSplit).toHaveBeenCalledWith(bill, 'i1', dto, null);
  });

  it('passes the bill and item id on', async () => {
    const controller = new ItemsController(service, claimsService);
    const item = { name: 'Laksa', unitPriceCents: 750, quantity: 1 };
    await controller.add(bill, item);
    await controller.update(bill, 'i1', { quantity: 2 });
    await controller.remove(bill, 'i1');

    expect(bills.addItem).toHaveBeenCalledWith(bill, item);
    expect(bills.updateItem).toHaveBeenCalledWith(bill, 'i1', { quantity: 2 });
    expect(bills.deleteItem).toHaveBeenCalledWith(bill, 'i1');
  });
});
