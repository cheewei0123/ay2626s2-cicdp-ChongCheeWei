import {
  IsJWT,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

// A 6-digit code from the app, or a backup code like "abcd-efgh" (KAN-92)
const CODE = /^(\d{6}|[a-z0-9]{4}[\s-]?[a-z0-9]{4})$/i;
const CODE_MESSAGE =
  'code must be the 6 digits from your app, or a backup code like abcd-efgh';

// POST /api/me/mfa/setup
export class MfaPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'password is required' })
  password!: string;
}

// POST /api/me/mfa/enable: only an app code turns it on, so the app is proved
export class MfaEnableDto {
  @Matches(/^\d{6}$/, { message: 'code must be the 6 digits from your app' })
  code!: string;
}

// POST /api/me/mfa/disable
export class MfaDisableDto extends MfaPasswordDto {
  @Matches(CODE, { message: CODE_MESSAGE })
  code!: string;
}

// DELETE /api/me (KAN-93): the code is needed only when two-step login is on
export class DeleteAccountDto extends MfaPasswordDto {
  @IsOptional()
  @Matches(CODE, { message: CODE_MESSAGE })
  code?: string;
}

// POST /api/auth/mfa: the second step of logging in
export class MfaLoginDto {
  @IsJWT({ message: 'mfaToken is missing. Log in again.' })
  mfaToken!: string;

  @Matches(CODE, { message: CODE_MESSAGE })
  code!: string;
}
