import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BillsService } from './bills.service.js';
import { ClaimsService } from './claims.service.js';
import { CreateItemDto, UpdateItemDto } from './dto/item.dto.js';
import { SetSplitDto } from './dto/set-split.dto.js';
import {
  BillOwnerGuard,
  type OwnedBill as OwnedBillType,
} from './guards/bill-owner.guard.js';
import { OwnedBill } from './guards/owned-bill.decorator.js';

// Items always belong to a bill, so their routes sit under /api/bills/:billId/items.
// Guards run in order: first "are you logged in?", then "is this your bill?"
@UseGuards(JwtAuthGuard, BillOwnerGuard)
@Controller('bills/:billId/items')
export class ItemsController {
  constructor(
    private readonly bills: BillsService,
    private readonly claims: ClaimsService,
  ) {}

  // PATCH /api/bills/:billId/items/:itemId/split → the owner changes how an item is split
  @Patch(':itemId/split')
  setSplit(
    @OwnedBill() bill: OwnedBillType,
    @Param('itemId') itemId: string,
    @Body() dto: SetSplitDto,
  ) {
    return this.claims.setSplit(bill, itemId, dto, null);
  }

  @Post()
  add(@OwnedBill() bill: OwnedBillType, @Body() dto: CreateItemDto) {
    return this.bills.addItem(bill, dto);
  }

  @Patch(':itemId')
  update(
    @OwnedBill() bill: OwnedBillType,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.bills.updateItem(bill, itemId, dto);
  }

  // 204 No Content: deleted, nothing to send back
  @Delete(':itemId')
  @HttpCode(204)
  remove(@OwnedBill() bill: OwnedBillType, @Param('itemId') itemId: string) {
    return this.bills.deleteItem(bill, itemId);
  }
}
