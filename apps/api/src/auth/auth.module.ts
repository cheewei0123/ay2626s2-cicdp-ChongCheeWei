import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { requireEnv } from '../common/env.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MeController } from './me.controller.js';

@Module({
  imports: [
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
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
