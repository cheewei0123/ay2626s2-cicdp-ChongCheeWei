import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from './auth-user.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { ChangePasswordDto } from './dto/password.dto.js';
import { MfaDisableDto, MfaEnableDto, MfaPasswordDto } from './dto/mfa.dto.js';
import { MfaService } from './mfa.service.js';
import { PhoneCodeDto, PhoneDto } from './dto/phone.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordResetService } from './password-reset.service.js';
import { PhoneVerificationService } from './phone-verification.service.js';
import { TelegramService } from '../telegram/telegram.service.js';

// GET /api/me: the logged-in user's profile; PATCH /api/me changes it. Without a valid token the guard answers 401.
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordResetService,
    private readonly phones: PhoneVerificationService,
    private readonly telegram: TelegramService,
    private readonly mfa: MfaService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const found = await this.auth.findSafeUser(user.id);
    // The token can outlive the account (e.g. a deleted user), so check it still exists
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  // PATCH /api/me { displayName? } → 200 the updated profile
  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    const updated = await this.auth.updateProfile(user.id, dto);
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  // POST /api/me/password { currentPassword, newPassword } → 200 { user, accessToken }.
  // Other devices are logged out; the new token keeps this one logged in (KAN-90).
  // 5 a minute, to slow down guessing the current password with a stolen token.
  @Post('password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.passwords.change(user.id, dto.currentPassword, dto.newPassword);
  }

  // GET /api/me/mfa → { on, backupCodesLeft } (KAN-92)
  @Get('mfa')
  async mfaStatus(@CurrentUser() user: AuthUser) {
    const found = await this.auth.findSafeUser(user.id);
    return {
      on: !!found?.mfaEnabledAt,
      backupCodesLeft: await this.mfa.backupCodesLeft(user.id),
    };
  }

  // POST /api/me/mfa/setup { password } → 200 { secret, otpauthUrl } for the QR code.
  // Each of these needs the password, so they share the password-guessing limit.
  @Post('mfa/setup')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  setupMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaPasswordDto) {
    return this.mfa.setup(user.id, dto.password);
  }

  // POST /api/me/mfa/enable { code } → 200 { backupCodes }, shown only this once
  @Post('mfa/enable')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  enableMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaEnableDto) {
    return this.mfa.enable(user.id, dto.code);
  }

  // POST /api/me/mfa/disable { password, code } → 200 the profile
  @Post('mfa/disable')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  disableMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaDisableDto) {
    return this.mfa.disable(user.id, dto.password, dto.code);
  }

  // GET /api/me/phone/methods → { telegram, sms }: which ways of checking work here
  @Get('phone/methods')
  phoneMethods() {
    return { telegram: this.telegram.enabled, sms: this.phones.smsReady };
  }

  // POST /api/me/phone/telegram { phone } → 200 { phone, expiresAt, url }: a one-time
  // t.me link to the bot, which checks the number for free. 5 per 10 minutes per IP.
  @Post('phone/telegram')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  startTelegram(@CurrentUser() user: AuthUser, @Body() dto: PhoneDto) {
    return this.telegram.startLink(user.id, dto.phone);
  }

  // POST /api/me/phone { phone } → 200 { phone, expiresAt }: texts a 6-digit code (KAN-91).
  // Each SMS costs money, so: 3 per 10 minutes per IP here, and one a minute per account.
  @Post('phone')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  sendPhoneCode(@CurrentUser() user: AuthUser, @Body() dto: PhoneDto) {
    return this.phones.sendCode(user.id, dto.phone);
  }

  // POST /api/me/phone/verify { code } → 200 the profile, with the number now checked
  @Post('phone/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyPhone(@CurrentUser() user: AuthUser, @Body() dto: PhoneCodeDto) {
    return this.phones.verify(user.id, dto.code);
  }

  // DELETE /api/me/phone → 200 the profile without a PayNow number
  @Delete('phone')
  removePhone(@CurrentUser() user: AuthUser) {
    return this.phones.remove(user.id);
  }
}
