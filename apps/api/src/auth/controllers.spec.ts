import { NotFoundException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import type { PasswordResetService } from './password-reset.service.js';
import type { PhoneVerificationService } from './phone-verification.service.js';
import type { VerificationService } from './verification.service.js';
import type { TelegramService } from '../telegram/telegram.service.js';
import type { MfaService } from './mfa.service.js';
import type { AccountDeletionService } from './account-deletion.service.js';
import type { GoogleAuthService } from './google-auth.service.js';

// A fake AuthService: the controllers should only pass work on to it
const auth = {
  register: vi.fn(),
  login: vi.fn(),
  findSafeUser: vi.fn(),
  updateProfile: vi.fn(),
  logout: vi.fn(),
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
const phonesMock = {
  sendCode: vi.fn(),
  verify: vi.fn(),
  remove: vi.fn(),
  smsReady: true,
};
const telegramMock = { startLink: vi.fn(), enabled: false };
const mfaMock = {
  setup: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  finishLogin: vi.fn(),
  backupCodesLeft: vi.fn(),
};
const mfa = mfaMock as unknown as MfaService;
const deletionMock = { delete: vi.fn() };
const googleMock = { login: vi.fn(), clientId: null as string | null };
const google = googleMock as unknown as GoogleAuthService;
const me = () =>
  new MeController(
    service,
    passwords,
    phonesMock as unknown as PhoneVerificationService,
    telegramMock as unknown as TelegramService,
    mfa,
    deletionMock as unknown as AccountDeletionService,
  );
const user = { id: 'u1', email: 'chee@example.com', sessionId: 's1' };

describe('AuthController', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes register and login to AuthService', async () => {
    auth.register.mockResolvedValue('registered');
    auth.login.mockResolvedValue('logged in');
    const controller = new AuthController(
      service,
      verifier,
      passwords,
      mfa,
      google,
    );
    const body = { email: 'chee@example.com', password: 'correct horse' };

    expect(await controller.register({ ...body, displayName: 'Chee' })).toBe(
      'registered',
    );
    expect(await controller.login(body)).toBe('logged in');
  });

  it('Google: gives the client ID and passes the credential on (KAN-95)', async () => {
    const controller = new AuthController(
      service,
      verifier,
      passwords,
      mfa,
      google,
    );
    googleMock.clientId = 'id.apps.googleusercontent.com';
    expect(controller.googleConfig()).toEqual({
      clientId: 'id.apps.googleusercontent.com',
    });
    googleMock.login.mockResolvedValue('logged in');
    expect(await controller.loginWithGoogle({ credential: 'a.b.c' })).toBe(
      'logged in',
    );
    expect(googleMock.login).toHaveBeenCalledWith('a.b.c');
  });

  it('logout ends the session on the request (KAN-97)', async () => {
    const controller = new AuthController(
      service,
      verifier,
      passwords,
      mfa,
      google,
    );
    await controller.logout(user);
    expect(auth.logout).toHaveBeenCalledWith('s1');
  });

  it('passes verify-email and resend to VerificationService', async () => {
    const controller = new AuthController(
      service,
      verifier,
      passwords,
      mfa,
      google,
    );
    await controller.verifyEmail({ token: 'a'.repeat(43) });
    await controller.resend(user);
    expect(verification.verify).toHaveBeenCalledWith('a'.repeat(43));
    expect(verification.resend).toHaveBeenCalledWith('u1');
  });

  it('passes forgot and reset password to PasswordResetService (KAN-90)', async () => {
    const controller = new AuthController(
      service,
      verifier,
      passwords,
      mfa,
      google,
    );
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
    expect(await me().me(user)).toMatchObject({
      displayName: 'Chee',
    });
    expect(auth.findSafeUser).toHaveBeenCalledWith('u1');
  });

  it('answers 404 when the account behind a valid token no longer exists', async () => {
    auth.findSafeUser.mockResolvedValue(null);
    await expect(me().me(user)).rejects.toThrow(NotFoundException);
  });

  it('saves profile changes for the logged-in user', async () => {
    auth.updateProfile.mockResolvedValue({ ...user, displayName: 'Chee W' });
    const dto = { displayName: 'Chee W' };
    expect(await me().update(user, dto)).toMatchObject({
      displayName: 'Chee W',
    });
    expect(auth.updateProfile).toHaveBeenCalledWith('u1', dto);
  });

  it('answers 404 when updating an account that no longer exists', async () => {
    auth.updateProfile.mockResolvedValue(null);
    await expect(
      me().update(user, {
        displayName: 'Chee',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('changes the password of the logged-in user (KAN-90)', async () => {
    passwordsMock.change.mockResolvedValue({ accessToken: 'new' });
    expect(
      await me().changePassword(user, {
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

describe('MeController: the PayNow number (KAN-91)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes sending, checking and removing the code to the service', async () => {
    phonesMock.sendCode.mockResolvedValue('sent');
    phonesMock.verify.mockResolvedValue('verified');
    phonesMock.remove.mockResolvedValue('removed');

    expect(await me().sendPhoneCode(user, { phone: '+6591234567' })).toBe(
      'sent',
    );
    expect(await me().verifyPhone(user, { code: '123456' })).toBe('verified');
    expect(await me().removePhone(user)).toBe('removed');
    expect(phonesMock.sendCode).toHaveBeenCalledWith('u1', '+6591234567');
    expect(phonesMock.verify).toHaveBeenCalledWith('u1', '123456');
    expect(phonesMock.remove).toHaveBeenCalledWith('u1');
  });

  it('says which ways of checking work, and passes the Telegram link on', async () => {
    expect(me().phoneMethods()).toEqual({ telegram: false, sms: true });
    telegramMock.startLink.mockResolvedValue('link');
    expect(await me().startTelegram(user, { phone: '+6591234567' })).toBe(
      'link',
    );
    expect(telegramMock.startLink).toHaveBeenCalledWith('u1', '+6591234567');
  });
});

describe('Two-step login routes (KAN-92)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('pass the login code, setup, enable and disable on to MfaService', async () => {
    mfaMock.finishLogin.mockResolvedValue('logged in');
    const controller = new AuthController(
      service,
      verifier,
      passwords,
      mfa,
      google,
    );
    expect(
      await controller.loginWithCode({ mfaToken: 't', code: '123456' }),
    ).toBe('logged in');
    expect(mfaMock.finishLogin).toHaveBeenCalledWith('t', '123456');

    await me().setupMfa(user, { password: 'pw' });
    await me().enableMfa(user, { code: '123456' });
    await me().disableMfa(user, { password: 'pw', code: 'abcd-efgh' });
    expect(mfaMock.setup).toHaveBeenCalledWith('u1', 'pw');
    expect(mfaMock.enable).toHaveBeenCalledWith('u1', '123456');
    expect(mfaMock.disable).toHaveBeenCalledWith('u1', 'pw', 'abcd-efgh');
  });

  it('DELETE /me passes the password and code on (KAN-93)', async () => {
    await me().deleteAccount(user, { password: 'pw', code: '123456' });
    expect(deletionMock.delete).toHaveBeenCalledWith('u1', 'pw', '123456');
  });

  it('GET /me/mfa says whether it is on and how many backup codes are left', async () => {
    auth.findSafeUser.mockResolvedValue({ mfaEnabledAt: new Date() });
    mfaMock.backupCodesLeft.mockResolvedValue(7);
    expect(await me().mfaStatus(user)).toEqual({
      on: true,
      backupCodesLeft: 7,
    });
    auth.findSafeUser.mockResolvedValue(null);
    mfaMock.backupCodesLeft.mockResolvedValue(0);
    expect(await me().mfaStatus(user)).toEqual({
      on: false,
      backupCodesLeft: 0,
    });
  });
});
