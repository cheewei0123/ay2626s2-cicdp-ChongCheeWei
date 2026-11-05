import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normaliseEmail } from './register.dto.js';

export class LoginDto {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'password is required' })
  password!: string;
}
