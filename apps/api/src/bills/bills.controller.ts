import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BillsService } from './bills.service.js';
import { ClaimsService } from './claims.service.js';
import { CreateBillDto, UpdateBillDto } from './dto/bill.dto.js';
import { ClaimDto } from './dto/claim.dto.js';
import { SummaryService } from './summary.service.js';
import {
  BillOwnerGuard,
  type OwnedBill as OwnedBillType,
} from './guards/bill-owner.guard.js';
import { OwnedBill } from './guards/owned-bill.decorator.js';

// Every route needs a login token (JwtAuthGuard on the class).
// Routes with :id also need BillOwnerGuard: 404 if the bill doesn't exist, 403 if it isn't yours.
@UseGuards(JwtAuthGuard)
@Controller('bills')
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly claims: ClaimsService,
    private readonly summary: SummaryService,
  ) {}

  // GET /api/bills/:id/summary → what everyone owes (owner view)
  @Get(':id/summary')
  @UseGuards(BillOwnerGuard)
  getSummary(@OwnedBill() bill: OwnedBillType) {
    return this.summary.forBill(bill.id);
  }

  // POST /api/bills/:id/claims → the owner claims an item they had
  @Post(':id/claims')
  @UseGuards(BillOwnerGuard)
  async claim(@OwnedBill() bill: OwnedBillType, @Body() dto: ClaimDto) {
    const me = await this.claims.ownerParticipantId(bill);
    return this.claims.claim(bill, me, dto.itemId, dto.shares);
  }

  // DELETE /api/bills/:id/claims/:itemId → the owner unclaims an item
  @Delete(':id/claims/:itemId')
  @UseGuards(BillOwnerGuard)
  @HttpCode(204)
  async unclaim(
    @OwnedBill() bill: OwnedBillType,
    @Param('itemId') itemId: string,
  ) {
    const me = await this.claims.ownerParticipantId(bill);
    return this.claims.unclaim(bill, me, itemId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBillDto) {
    return this.bills.create(user.id, dto);
  }

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.bills.listMine(user.id);
  }

  @Get(':id')
  @UseGuards(BillOwnerGuard)
  getDetails(@OwnedBill() bill: OwnedBillType) {
    return this.bills.getDetails(bill.id);
  }

  @Patch(':id')
  @UseGuards(BillOwnerGuard)
  update(@OwnedBill() bill: OwnedBillType, @Body() dto: UpdateBillDto) {
    return this.bills.update(bill, dto);
  }

  // POST /api/bills/:id/lock → 200 { id, status: "LOCKED" }; 409 if it isn't OPEN
  @Post(':id/lock')
  @UseGuards(BillOwnerGuard)
  @HttpCode(200)
  lock(@OwnedBill() bill: OwnedBillType) {
    return this.claims.lock(bill);
  }

  // POST /api/bills/:id/unlock → 200 { id, status: "OPEN" }; 409 if it isn't LOCKED
  @Post(':id/unlock')
  @UseGuards(BillOwnerGuard)
  @HttpCode(200)
  unlock(@OwnedBill() bill: OwnedBillType) {
    return this.claims.unlock(bill);
  }
}
