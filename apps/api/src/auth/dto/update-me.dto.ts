import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { trim } from '../../common/transforms.js';

// PATCH /api/me: change your name or PayNow number. Leave a field out to keep it;
// send paynowMobile: null to remove the number.
export class UpdateMeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50, { message: 'displayName must be 1 to 50 characters' })
  displayName?: string;

  // @IsOptional also lets null through, which clears the number
  @IsOptional()
  @Matches(/^\+65[89]\d{7}$/, {
    message: 'paynowMobile must be a Singapore mobile number like +6591234567',
  })
  paynowMobile?: string | null;
}
