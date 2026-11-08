import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClaimsService } from './claims.service.js';
import { ClaimDto } from './dto/claim.dto.js';
import { JoinBillDto } from './dto/join.dto.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';
import { CurrentGuest } from './guards/current-guest.decorator.js';
import { type Guest, GuestTokenGuard } from './guards/guest-token.guard.js';
import { ShareTokenGuard } from './guards/share-token.guard.js';
import { SharedBill } from './guards/shared-bill.decorator.js';
import { ShareService } from './share.service.js';

// Guest routes: no login, the share token in the URL finds the bill (404 if wrong)
@UseGuards(ShareTokenGuard)
@Controller('share/:token')
export class ShareController {
  constructor(
    private readonly share: ShareService,
    private readonly claims: ClaimsService,
  ) {}

  // POST /api/share/:token/claims → 201 claim. Needs the guest token from joining.
  @Post('claims')
  @UseGuards(GuestTokenGuard)
  claim(
    @SharedBill() bill: OwnedBill,
    @CurrentGuest() guest: Guest,
    @Body() dto: ClaimDto,
  ) {
    return this.claims.claim(bill, guest.participantId, dto.itemId, dto.shares);
  }

  // DELETE /api/share/:token/claims/:itemId → 204
  @Delete('claims/:itemId')
  @UseGuards(GuestTokenGuard)
  @HttpCode(204)
  unclaim(
    @SharedBill() bill: OwnedBill,
    @CurrentGuest() guest: Guest,
    @Param('itemId') itemId: string,
  ) {
    return this.claims.unclaim(bill, guest.participantId, itemId);
  }

  // GET /api/share/:token → the bill as a guest sees it
  @Get()
  view(@SharedBill() bill: OwnedBill) {
    return this.share.view(bill.id);
  }

  // POST /api/share/:token/participants → 201 { participant, guestToken }
  @Post('participants')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  join(@SharedBill() bill: OwnedBill, @Body() dto: JoinBillDto) {
    return this.share.join(bill, dto.displayName);
  }
}

// GET /api/join/:code → { shareToken }; rate limited so codes can't be guessed in bulk
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('join')
export class JoinController {
  constructor(private readonly share: ShareService) {}

  @Get(':code')
  find(@Param('code') code: string) {
    return this.share.shareTokenFor(code);
  }
}
