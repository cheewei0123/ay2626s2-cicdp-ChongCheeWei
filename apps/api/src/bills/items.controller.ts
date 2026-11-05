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
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BillsService } from './bills.service.js';
import { CreateItemDto, UpdateItemDto } from './dto/item.dto.js';

// Items always belong to a bill, so their routes sit under /api/bills/:billId/items
@UseGuards(JwtAuthGuard)
@Controller('bills/:billId/items')
export class ItemsController {
  constructor(private readonly bills: BillsService) {}

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Param('billId') billId: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.bills.addItem(user.id, billId, dto);
  }

  @Patch(':itemId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('billId') billId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.bills.updateItem(user.id, billId, itemId, dto);
  }

  // 204 No Content: deleted, nothing to send back
  @Delete(':itemId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('billId') billId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.bills.deleteItem(user.id, billId, itemId);
  }
}
