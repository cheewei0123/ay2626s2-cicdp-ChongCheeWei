import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BillsService } from './bills.service.js';
import { CreateBillDto, UpdateBillDto } from './dto/bill.dto.js';

// Every route here needs a login token; each user only ever sees their own bills
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
  getMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bills.getMine(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBillDto,
  ) {
    return this.bills.update(user.id, id, dto);
  }
}
