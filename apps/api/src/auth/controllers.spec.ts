import { NotFoundException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';

// A fake AuthService: the controllers should only pass work on to it
const auth = {
  register: vi.fn(),
  login: vi.fn(),
  findSafeUser: vi.fn(),
};
const service = auth as unknown as AuthService;
const user = { id: 'u1', email: 'chee@example.com' };

describe('AuthController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes register and login to AuthService', async () => {
    auth.register.mockResolvedValue('registered');
    auth.login.mockResolvedValue('logged in');
    const controller = new AuthController(service);
    const body = { email: 'chee@example.com', password: 'correct horse' };

    expect(await controller.register({ ...body, displayName: 'Chee' })).toBe(
      'registered',
    );
    expect(await controller.login(body)).toBe('logged in');
  });
});

describe('MeController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the logged-in user', async () => {
    auth.findSafeUser.mockResolvedValue({ ...user, displayName: 'Chee' });
    expect(await new MeController(service).me(user)).toMatchObject({
      displayName: 'Chee',
    });
    expect(auth.findSafeUser).toHaveBeenCalledWith('u1');
  });

  it('answers 404 when the account behind a valid token no longer exists', async () => {
    auth.findSafeUser.mockResolvedValue(null);
    await expect(new MeController(service).me(user)).rejects.toThrow(
      NotFoundException,
    );
  });
});
