import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from './auth-user.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { MfaLoginDto } from './dto/mfa.dto.js';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MfaService } from './mfa.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { VerificationService } from './verification.service.js';

// Stricter rate limit than the global 100/min, to slow down password guessing
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: VerificationService,
    private readonly passwords: PasswordResetService,
    private readonly mfa: MfaService,
  ) {}

  // POST /api/auth/register → 201 { user, accessToken }
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // POST /api/auth/login → 200 { user, accessToken }, or { mfaRequired, mfaToken }
  // when two-step login is on (KAN-92)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // POST /api/auth/mfa { mfaToken, code } → 200 { user, accessToken }. 5 a minute
  // per IP, and the half-way token lasts 5 minutes, so guessing a 6-digit code
  // would take far longer than anyone has.
  @Post('mfa')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  loginWithCode(@Body() dto: MfaLoginDto) {
    return this.mfa.finishLogin(dto.mfaToken, dto.code);
  }

  // POST /api/auth/logout → 204: ends this login on the server (KAN-97). Other
  // devices stay logged in.
  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logout(user.sessionId);
  }

  // POST /api/auth/verify-email { token } → 204. No login needed: the token is the proof.
  @Post('verify-email')
  @HttpCode(204)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.verification.verify(dto.token);
  }

  // POST /api/auth/resend-verification → 204, a new link by email.
  // 3 an hour, so it can't be used to flood someone's inbox.
  @Post('resend-verification')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60 * 60_000 } })
  resend(@CurrentUser() user: AuthUser) {
    return this.verification.resend(user.id);
  }

  // POST /api/auth/forgot-password { email } → 204 whether or not the account exists.
  // 5 an hour from one IP, so it can't be used to flood someone's inbox (KAN-90).
  @Post('forgot-password')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwords.requestReset(dto.email);
  }

  // POST /api/auth/reset-password { token, password } → 204; the user then logs in
  @Post('reset-password')
  @HttpCode(204)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwords.reset(dto.token, dto.password);
  }
}
