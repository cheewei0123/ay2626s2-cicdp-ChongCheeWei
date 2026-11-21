import { NotFoundException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import type { VerificationService } from './verification.service.js';

// A fake AuthService: the controllers should only pass work on to it
const auth = {
  register: vi.fn(),
  login: vi.fn(),
  findSafeUser: vi.fn(),
  updateProfile: vi.fn(),
};
const service = auth as unknown as AuthService;
const verification = { verify: vi.fn(), resend: vi.fn() };
const verifier = verification as unknown as VerificationService;
const user = { id: 'u1', email: 'chee@example.com' };

describe('AuthController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes register and login to AuthService', async () => {
    auth.register.mockResolvedValue('registered');
    auth.login.mockResolvedValue('logged in');
    const controller = new AuthController(service, verifier);
    const body = { email: 'chee@example.com', password: 'correct horse' };

    expect(await controller.register({ ...body, displayName: 'Chee' })).toBe(
      'registered',
    );
    expect(await controller.login(body)).toBe('logged in');
  });

  it('passes verify-email and resend to VerificationService', async () => {
    const controller = new AuthController(service, verifier);
    await controller.verifyEmail({ token: 'a'.repeat(43) });
    await controller.resend(user);
    expect(verification.verify).toHaveBeenCalledWith('a'.repeat(43));
    expect(verification.resend).toHaveBeenCalledWith('u1');
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

  it('saves profile changes for the logged-in user', async () => {
    auth.updateProfile.mockResolvedValue({ ...user, paynowMobile: null });
    const dto = { paynowMobile: null };
    expect(await new MeController(service).update(user, dto)).toMatchObject({
      paynowMobile: null,
    });
    expect(auth.updateProfile).toHaveBeenCalledWith('u1', dto);
  });

  it('answers 404 when updating an account that no longer exists', async () => {
    auth.updateProfile.mockResolvedValue(null);
    await expect(
      new MeController(service).update(user, { displayName: 'Chee' }),
    ).rejects.toThrow(NotFoundException);
  });
});
