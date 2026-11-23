import { NotFoundException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import type { PasswordResetService } from './password-reset.service.js';
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
const passwordsMock = {
  requestReset: vi.fn(),
  reset: vi.fn(),
  change: vi.fn(),
};
const passwords = passwordsMock as unknown as PasswordResetService;
const user = { id: 'u1', email: 'chee@example.com' };

describe('AuthController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes register and login to AuthService', async () => {
    auth.register.mockResolvedValue('registered');
    auth.login.mockResolvedValue('logged in');
    const controller = new AuthController(service, verifier, passwords);
    const body = { email: 'chee@example.com', password: 'correct horse' };

    expect(await controller.register({ ...body, displayName: 'Chee' })).toBe(
      'registered',
    );
    expect(await controller.login(body)).toBe('logged in');
  });

  it('passes verify-email and resend to VerificationService', async () => {
    const controller = new AuthController(service, verifier, passwords);
    await controller.verifyEmail({ token: 'a'.repeat(43) });
    await controller.resend(user);
    expect(verification.verify).toHaveBeenCalledWith('a'.repeat(43));
    expect(verification.resend).toHaveBeenCalledWith('u1');
  });

  it('passes forgot and reset password to PasswordResetService (KAN-90)', async () => {
    const controller = new AuthController(service, verifier, passwords);
    await controller.forgotPassword({ email: 'chee@example.com' });
    await controller.resetPassword({
      token: 't'.repeat(43),
      password: 'new password',
    });
    expect(passwordsMock.requestReset).toHaveBeenCalledWith('chee@example.com');
    expect(passwordsMock.reset).toHaveBeenCalledWith(
      't'.repeat(43),
      'new password',
    );
  });
});

describe('MeController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the logged-in user', async () => {
    auth.findSafeUser.mockResolvedValue({ ...user, displayName: 'Chee' });
    expect(await new MeController(service, passwords).me(user)).toMatchObject({
      displayName: 'Chee',
    });
    expect(auth.findSafeUser).toHaveBeenCalledWith('u1');
  });

  it('answers 404 when the account behind a valid token no longer exists', async () => {
    auth.findSafeUser.mockResolvedValue(null);
    await expect(new MeController(service, passwords).me(user)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('saves profile changes for the logged-in user', async () => {
    auth.updateProfile.mockResolvedValue({ ...user, paynowMobile: null });
    const dto = { paynowMobile: null };
    expect(
      await new MeController(service, passwords).update(user, dto),
    ).toMatchObject({
      paynowMobile: null,
    });
    expect(auth.updateProfile).toHaveBeenCalledWith('u1', dto);
  });

  it('answers 404 when updating an account that no longer exists', async () => {
    auth.updateProfile.mockResolvedValue(null);
    await expect(
      new MeController(service, passwords).update(user, {
        displayName: 'Chee',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('changes the password of the logged-in user (KAN-90)', async () => {
    passwordsMock.change.mockResolvedValue({ accessToken: 'new' });
    expect(
      await new MeController(service, passwords).changePassword(user, {
        currentPassword: 'old password',
        newPassword: 'new password',
      }),
    ).toEqual({ accessToken: 'new' });
    expect(passwordsMock.change).toHaveBeenCalledWith(
      'u1',
      'old password',
      'new password',
    );
  });
});
