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
import { PhoneCodeDto, PhoneDto } from './dto/phone.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordResetService } from './password-reset.service.js';
import { PhoneVerificationService } from './phone-verification.service.js';

// GET /api/me: the logged-in user's profile; PATCH /api/me changes it. Without a valid token the guard answers 401.
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordResetService,
    private readonly phones: PhoneVerificationService,
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
