import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  CreateExpenseDto,
  ListExpensesQueryDto,
  MonthQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto.js';
import { ExpensesService } from './expenses.service.js';

const MAX_BYTES = 5 * 1024 * 1024;

// Every route needs a login, and works only on the logged-in user's own expenses.
// (EmailVerifiedGuard is added in KAN-77.)
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  // GET /api/expenses?month=2026-11&page=1&pageSize=50 → one page, newest first
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListExpensesQueryDto) {
    return this.expenses.list(user.id, query);
  }

  // GET /api/expenses/summary?month=2026-11 → total and per-category totals
  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: MonthQueryDto) {
    return this.expenses.summary(user.id, query.month);
  }

  // POST /api/expenses → add an expense by hand (or save a checked receipt draft)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user.id, dto);
  }

  // POST /api/expenses/receipt (multipart, field "image") → a draft, not saved
  @Post('receipt')
  // Same limits as the bill receipt route (KAN-33): Gemini's free rate, 5 MB
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_BYTES } }),
  )
  scan(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: /^image\/(jpeg|png)$/ }),
        ],
      }),
    )
    image: {
      buffer: Buffer;
      mimetype: string;
    },
  ) {
    return this.expenses.draftFromPhoto(image.buffer, image.mimetype);
  }

  // PATCH /api/expenses/:id → change some fields
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(user.id, id, dto);
  }

  // DELETE /api/expenses/:id → 204
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expenses.remove(user.id, id);
  }
}
