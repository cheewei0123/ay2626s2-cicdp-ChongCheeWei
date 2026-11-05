import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JoinBillDto } from './dto/join.dto.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';
import { ShareTokenGuard } from './guards/share-token.guard.js';
import { SharedBill } from './guards/shared-bill.decorator.js';
import { ShareService } from './share.service.js';

// Guest routes: no login, the share token in the URL finds the bill (404 if wrong)
@UseGuards(ShareTokenGuard)
@Controller('share/:token')
export class ShareController {
  constructor(private readonly share: ShareService) {}

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
