import { Module } from '@nestjs/common';
import { createTelegramConfig, TELEGRAM_CONFIG } from './telegram.config.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';

// The Telegram bot that checks PayNow numbers (KAN-91). Off unless TELEGRAM_* is set.
@Module({
  controllers: [TelegramController],
  providers: [
    {
      provide: TELEGRAM_CONFIG,
      useFactory: () => createTelegramConfig(process.env),
    },
    TelegramService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
