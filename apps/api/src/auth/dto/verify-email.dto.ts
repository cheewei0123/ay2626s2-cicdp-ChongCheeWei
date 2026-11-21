import { IsString, Length } from 'class-validator';

// POST /api/auth/verify-email { token }: the token from the link in the email
export class VerifyEmailDto {
  @IsString({ message: 'token is missing' })
  @Length(20, 100, { message: 'token is missing' })
  token!: string;
}
