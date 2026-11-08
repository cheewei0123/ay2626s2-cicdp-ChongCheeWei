import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// POST /api/share/:token/claims: "I had this item"
export class ClaimDto {
  @IsString()
  @IsNotEmpty({ message: 'itemId is required' })
  itemId!: string;

  // 2 means "I had twice as much as someone with 1"; leave out for an equal split
  @IsOptional()
  @IsInt({ message: 'shares must be a whole number' })
  @Min(1, { message: 'shares must be 1 to 100' })
  @Max(100, { message: 'shares must be 1 to 100' })
  shares?: number;
}
