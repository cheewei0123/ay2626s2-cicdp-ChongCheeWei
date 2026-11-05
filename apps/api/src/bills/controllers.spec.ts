import { BillsController } from './bills.controller.js';
import type { BillsService } from './bills.service.js';
import { ItemsController } from './items.controller.js';

// A fake BillsService: the controllers should pass the logged-in user's id and the ids from the URL
const bills = {
  create: vi.fn(),
  listMine: vi.fn(),
  getMine: vi.fn(),
  update: vi.fn(),
  addItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
};
const service = bills as unknown as BillsService;
const user = { id: 'u1', email: 'chee@example.com' };

describe('BillsController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes the logged-in user to every call', async () => {
    const controller = new BillsController(service);
    await controller.create(user, { title: 'Dinner' });
    await controller.listMine(user);
    await controller.getMine(user, 'b1');
    await controller.update(user, 'b1', { title: 'New' });

    expect(bills.create).toHaveBeenCalledWith('u1', { title: 'Dinner' });
    expect(bills.listMine).toHaveBeenCalledWith('u1');
    expect(bills.getMine).toHaveBeenCalledWith('u1', 'b1');
    expect(bills.update).toHaveBeenCalledWith('u1', 'b1', { title: 'New' });
  });
});

describe('ItemsController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes the user, bill id and item id on', async () => {
    const controller = new ItemsController(service);
    const item = { name: 'Laksa', unitPriceCents: 750, quantity: 1 };
    await controller.add(user, 'b1', item);
    await controller.update(user, 'b1', 'i1', { quantity: 2 });
    await controller.remove(user, 'b1', 'i1');

    expect(bills.addItem).toHaveBeenCalledWith('u1', 'b1', item);
    expect(bills.updateItem).toHaveBeenCalledWith('u1', 'b1', 'i1', {
      quantity: 2,
    });
    expect(bills.deleteItem).toHaveBeenCalledWith('u1', 'b1', 'i1');
  });
});
