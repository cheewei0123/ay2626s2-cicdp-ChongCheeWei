import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { trim } from '../../common/transforms.js';

// Money is whole cents: 1.5 would be a fraction of a cent, so it is rejected
const PRICE_MAX = 10_000_000; // $100,000 per item is more than any real receipt

// POST /api/bills/:billId/items
export class CreateItemDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80, { message: 'name must be 1 to 80 characters' })
  name!: string;

  @IsInt({ message: 'unitPriceCents must be a whole number of cents' })
  @Min(1, { message: 'unitPriceCents must be at least 1' })
  @Max(PRICE_MAX, { message: `unitPriceCents must be at most ${PRICE_MAX}` })
  unitPriceCents!: number;

  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be 1 to 999' })
  @Max(999, { message: 'quantity must be 1 to 999' })
  quantity: number = 1;
}

// PATCH /api/bills/:billId/items/:itemId: the same rules, every field optional
export class UpdateItemDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80, { message: 'name must be 1 to 80 characters' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'unitPriceCents must be a whole number of cents' })
  @Min(1, { message: 'unitPriceCents must be at least 1' })
  @Max(PRICE_MAX, { message: `unitPriceCents must be at most ${PRICE_MAX}` })
  unitPriceCents?: number;

  @IsOptional()
  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be 1 to 999' })
  @Max(999, { message: 'quantity must be 1 to 999' })
  quantity?: number;
}
