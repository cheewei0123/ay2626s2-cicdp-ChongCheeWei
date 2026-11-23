import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normaliseEmail } from '../../common/transforms.js';

// POST /api/auth/forgot-password { email }
export class ForgotPasswordDto {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;
}

// POST /api/auth/reset-password { token, password }: the token from the emailed link
export class ResetPasswordDto {
  @IsString({ message: 'token is missing' })
  @Length(20, 100, { message: 'token is missing' })
  token!: string;

  // Same rules as RegisterDto, so a new password is never weaker than a first one
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128, { message: 'password must be at most 128 characters' })
  password!: string;
}

// POST /api/me/password { currentPassword, newPassword }
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'currentPassword is required' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'newPassword must be at least 8 characters' })
  @MaxLength(128, { message: 'newPassword must be at most 128 characters' })
  newPassword!: string;
}
