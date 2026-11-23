import {
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type TelegramReply,
  TelegramService,
  type TelegramUpdate,
} from './telegram.service.js';

const digest = (text: string) => createHash('sha256').update(text).digest();

// POST /api/telegram/webhook: Telegram delivers messages sent to the bot here (KAN-91).
// Only calls carrying the secret set in setWebhook are read, so no one else can
// pretend to be Telegram. Every user's messages come from Telegram's few servers,
// so the per-IP limit is skipped; the secret check comes first instead.
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') given: string | undefined,
    // A plain interface, so the validation pipe passes Telegram's fields through
    @Body() update: TelegramUpdate,
  ): Promise<TelegramReply | Record<string, never>> {
    const secret = this.telegram.secret;
    if (!secret) throw new NotFoundException();
    // Compared as hashes, so the check takes the same time whatever was sent
    if (!given || !timingSafeEqual(digest(given), digest(secret)))
      throw new UnauthorizedException();
    return (await this.telegram.handle(update)) ?? {};
  }
}
