import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Trims spaces and lower-cases, so "Chee@Example.com " and "chee@example.com" are one account
export const normaliseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// The shape and rules for POST /api/auth/register; ValidationPipe checks them before the controller runs
export class RegisterDto {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128, { message: 'password must be at most 128 characters' })
  password!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 50, { message: 'displayName must be 1 to 50 characters' })
  displayName!: string;

  @IsOptional()
  @Matches(/^\+65[89]\d{7}$/, {
    message: 'paynowMobile must be a Singapore mobile number like +6591234567',
  })
  paynowMobile?: string;
}
