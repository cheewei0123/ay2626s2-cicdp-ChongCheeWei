import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { requireEnv } from '../common/env.js';
import { EmailModule } from '../email/email.module.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthService } from './google-auth.service.js';
import { createGoogleVerifier, GOOGLE_VERIFIER } from './google.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MeController } from './me.controller.js';
import { MfaService } from './mfa.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { VerificationService } from './verification.service.js';

import { SmsModule } from '../sms/sms.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { PhoneVerificationService } from './phone-verification.service.js';

@Module({
  imports: [
    EmailModule, // sends the verify-your-email link (KAN-77)
    SmsModule, // texts the code that checks a PayNow number (KAN-91)
    TelegramModule, // or checks it for free through the Telegram bot
    // global: true lets JwtAuthGuard be used in any module, since it needs JwtService
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: requireEnv('JWT_SECRET'),
        signOptions: { expiresIn: '14d' }, // a login lasts 14 days (KAN-97)
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    VerificationService,
    PasswordResetService,
    PhoneVerificationService,
    MfaService,
    AccountDeletionService, // deletes accounts, and wipes them 6 months later (KAN-93)
    GoogleAuthService, // "Continue with Google" (KAN-95)
    {
      provide: GOOGLE_VERIFIER,
      useFactory: () => createGoogleVerifier(process.env), // null: not set up
    },
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
