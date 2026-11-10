import type { AuthUser } from '../auth/auth-user.js';
import { ExpensesController } from './expenses.controller.js';
import type { ExpensesService } from './expenses.service.js';

describe('ExpensesController', () => {
  const me: AuthUser = { id: 'u1', email: 'chee@example.com' };
  const service = {
    list: vi.fn(),
    summary: vi.fn(),
    create: vi.fn(),
    draftFromPhoto: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const controller = new ExpensesController(
    service as unknown as ExpensesService,
  );

  it('always passes the logged-in user’s ID, so nobody can act for someone else', async () => {
    const photo = Buffer.from('png bytes');
    const dto = {
      amountCents: 100,
      category: 'OTHERS',
      spentAt: '2026-11-05',
    } as const;

    await controller.list(me, { month: '2026-11' });
    await controller.summary(me, { month: '2026-11' });
    await controller.create(me, dto);
    await controller.update(me, 'e1', { note: 'hi' });
    await controller.remove(me, 'e1');
    await controller.scan({ buffer: photo, mimetype: 'image/png' });

    expect(service.list).toHaveBeenCalledWith('u1', { month: '2026-11' });
    expect(service.summary).toHaveBeenCalledWith('u1', '2026-11');
    expect(service.create).toHaveBeenCalledWith('u1', dto);
    expect(service.update).toHaveBeenCalledWith('u1', 'e1', { note: 'hi' });
    expect(service.remove).toHaveBeenCalledWith('u1', 'e1');
    expect(service.draftFromPhoto).toHaveBeenCalledWith(photo, 'image/png');
  });
});
