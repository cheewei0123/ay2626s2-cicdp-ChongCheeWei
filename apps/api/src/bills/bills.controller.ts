import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BillsService } from './bills.service.js';
import { CreateBillDto, UpdateBillDto } from './dto/bill.dto.js';
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
  constructor(private readonly bills: BillsService) {}

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
}
