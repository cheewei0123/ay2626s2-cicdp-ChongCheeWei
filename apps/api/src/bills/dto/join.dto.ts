import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trim } from '../../common/transforms.js';

// POST /api/share/:token/participants: a guest only gives a name
export class JoinBillDto {
  @Transform(trim)
  @IsString()
  @Length(1, 30, { message: 'displayName must be 1 to 30 characters' })
  displayName!: string;
}
