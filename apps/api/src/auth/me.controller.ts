import {
  Body,
  Controller,
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
import { UpdateMeDto } from './dto/update-me.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordResetService } from './password-reset.service.js';

// GET /api/me: the logged-in user's profile; PATCH /api/me changes it. Without a valid token the guard answers 401.
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordResetService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const found = await this.auth.findSafeUser(user.id);
    // The token can outlive the account (e.g. a deleted user), so check it still exists
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  // PATCH /api/me { displayName?, paynowMobile? } → 200 the updated profile
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
}
