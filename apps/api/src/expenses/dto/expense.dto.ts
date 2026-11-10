import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../common/transforms.js';
import { Category } from '../../generated/prisma/enums.js';

// $1,000,000 in cents: well inside Postgres' Int limit (about $21 million)
const MAX_CENTS = 100_000_000;
const AMOUNT = {
  message: 'amountCents must be a whole number of cents, 1 to 100000000',
};
const CATEGORY = {
  message: `category must be one of: ${Object.values(Category).join(', ')}`,
};
const SPENT_AT = {
  message:
    'spentAt must be a date like 2026-11-05 or 2026-11-05T19:30:00+08:00',
};
const MONTH = { message: 'month must look like 2026-11' };

// POST /api/expenses
export class CreateExpenseDto {
  @IsInt(AMOUNT)
  @Min(1, AMOUNT)
  @Max(MAX_CENTS, AMOUNT)
  amountCents!: number;

  @IsEnum(Category, CATEGORY)
  category!: Category;

  @IsDateString({ strict: true }, SPENT_AT)
  spentAt!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80, { message: 'merchant must be at most 80 characters' })
  merchant?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: 'note must be at most 200 characters' })
  note?: string;

  // RECEIPT when the user saves a scanned draft. BILL_SHARE only ever comes from a locked bill.
  @IsOptional()
  @IsIn(['MANUAL', 'RECEIPT'], { message: 'source must be MANUAL or RECEIPT' })
  source?: 'MANUAL' | 'RECEIPT';
}

// PATCH /api/expenses/:id: the same rules, every field optional, source can't change
export class UpdateExpenseDto {
  @IsOptional()
  @IsInt(AMOUNT)
  @Min(1, AMOUNT)
  @Max(MAX_CENTS, AMOUNT)
  amountCents?: number;

  @IsOptional()
  @IsEnum(Category, CATEGORY)
  category?: Category;

  @IsOptional()
  @IsDateString({ strict: true }, SPENT_AT)
  spentAt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80, { message: 'merchant must be at most 80 characters' })
  merchant?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: 'note must be at most 200 characters' })
  note?: string;
}

// ?month=2026-11 (leave it out for the current month in Singapore)
export class MonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, MONTH)
  month?: string;
}

// GET /api/expenses?month=2026-11&page=1&pageSize=50
export class ListExpensesQueryDto extends MonthQueryDto {
  // Query values arrive as text; @Type turns "2" into 2 before the checks run
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be a whole number from 1' })
  @Min(1, { message: 'page must be a whole number from 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be 1 to 100' })
  @Min(1, { message: 'pageSize must be 1 to 100' })
  @Max(100, { message: 'pageSize must be 1 to 100' })
  pageSize?: number;
}
