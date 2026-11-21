import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

// GET /api/me: the logged-in user's profile; PATCH /api/me changes it. Without a valid token the guard answers 401.
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

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
}
