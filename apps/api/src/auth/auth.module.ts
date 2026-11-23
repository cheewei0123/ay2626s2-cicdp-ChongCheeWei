import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { requireEnv } from '../common/env.js';
import { EmailModule } from '../email/email.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MeController } from './me.controller.js';
import { PasswordResetService } from './password-reset.service.js';
import { VerificationService } from './verification.service.js';

@Module({
  imports: [
    EmailModule, // sends the verify-your-email link (KAN-77)
    // global: true lets JwtAuthGuard be used in any module, since it needs JwtService
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: requireEnv('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    VerificationService,
    PasswordResetService,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
