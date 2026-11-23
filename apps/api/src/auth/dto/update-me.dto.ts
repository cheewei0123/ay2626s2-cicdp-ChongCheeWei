import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';
import { trim } from '../../common/transforms.js';

// PATCH /api/me: change your name. The PayNow number is changed through
// POST /me/phone, which checks it with an SMS code first (KAN-91).
export class UpdateMeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50, { message: 'displayName must be 1 to 50 characters' })
  displayName?: string;
}
