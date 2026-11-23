import { IsJWT } from 'class-validator';

// POST /api/auth/google: the ID token Google gave the browser (KAN-95)
export class GoogleLoginDto {
  @IsJWT({ message: 'credential must be the ID token from Google' })
  credential!: string;
}
