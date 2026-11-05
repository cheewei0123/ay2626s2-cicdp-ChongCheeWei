import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../common/transforms.js';

// Rates are basis points: 1000 = 10%, 10000 = 100%
const BP_RANGE = (name: string) => ({
  message: `${name} must be between 0 and 10000`,
});
const WHOLE_BP = (name: string) => ({
  message: `${name} must be a whole number of basis points`,
});

// POST /api/bills. Only the title is required; the rest have sensible defaults.
export class CreateBillDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80, { message: 'title must be 1 to 80 characters' })
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80, { message: 'merchant must be at most 80 characters' })
  merchant?: string;

  // Defaults to today when left out
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'date must be a date like 2026-11-05' },
  )
  date?: string;

  // Defaults to 1000 (10%) in the database; a hawker bill sends 0
  @IsOptional()
  @IsInt(WHOLE_BP('serviceBp'))
  @Min(0, BP_RANGE('serviceBp'))
  @Max(10000, BP_RANGE('serviceBp'))
  serviceBp?: number;

  // Defaults to 900 (9%) in the database
  @IsOptional()
  @IsInt(WHOLE_BP('gstBp'))
  @Min(0, BP_RANGE('gstBp'))
  @Max(10000, BP_RANGE('gstBp'))
  gstBp?: number;
}

// PATCH /api/bills/:id: the same rules, but every field is optional
export class UpdateBillDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80, { message: 'title must be 1 to 80 characters' })
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80, { message: 'merchant must be at most 80 characters' })
  merchant?: string;

  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'date must be a date like 2026-11-05' },
  )
  date?: string;

  @IsOptional()
  @IsInt(WHOLE_BP('serviceBp'))
  @Min(0, BP_RANGE('serviceBp'))
  @Max(10000, BP_RANGE('serviceBp'))
  serviceBp?: number;

  @IsOptional()
  @IsInt(WHOLE_BP('gstBp'))
  @Min(0, BP_RANGE('gstBp'))
  @Max(10000, BP_RANGE('gstBp'))
  gstBp?: number;
}
