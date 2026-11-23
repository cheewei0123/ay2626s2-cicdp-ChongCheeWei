import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  registerWebhook,
  TELEGRAM_CONFIG,
  type TelegramConfig,
} from './telegram.config.js';

const LINK_MS = 10 * 60 * 1000; // a link lasts 10 minutes, like an SMS code

// The parts of a Telegram update the bot reads (https://core.telegram.org/bots/api#update)
export interface TelegramUpdate {
  message?: {
    chat: { id: number; type: string };
    from?: { id: number };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
}

// What the webhook answers with. Telegram runs it as a sendMessage call, so the
// bot replies without making a request of its own.
export interface TelegramReply {
  method: 'sendMessage';
  chat_id: number;
  text: string;
  reply_markup?: object;
}

const hashOf = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const pretty = (phone: string) =>
  `${phone.slice(0, 3)} ${phone.slice(3, 7)} ${phone.slice(7)}`;
const noKeyboard = { remove_keyboard: true };

// Checking the PayNow number through Telegram (KAN-91), free instead of a paid SMS.
// Telegram checked the account's number by SMS when it was made, and a contact the
// user shares with the "Share my phone number" button is always their own. So a
// shared number that matches the one typed in SplitLah proves they hold it.
@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Telegram');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TELEGRAM_CONFIG) private readonly config: TelegramConfig | null,
  ) {}

  get enabled() {
    return this.config !== null;
  }

  get secret() {
    return this.config?.secret ?? null;
  }

  async onApplicationBootstrap() {
    if (!this.config) return;
    const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
    this.logger.log(await registerWebhook(this.config, appUrl));
  }

  // A one-time t.me link that opens the bot with this check waiting. Only the hash
  // is stored; anyone who sees the link still can't check a number that isn't theirs.
  async startLink(userId: string, phone: string) {
    if (!this.config)
      throw new ServiceUnavailableException(
        'Checking by Telegram is not set up on this server',
      );
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paynowMobile: true, phoneVerifiedAt: true },
    });
    if (user?.paynowMobile === phone && user.phoneVerifiedAt)
      throw new ConflictException('This number is already checked');

    const token = randomBytes(24).toString('base64url'); // t.me allows A-Z a-z 0-9 _ -
    const expiresAt = new Date(Date.now() + LINK_MS);
    const fields = {
      phone,
      codeHash: null, // a waiting SMS code stops working
      attempts: 0,
      linkHash: hashOf(token),
      telegramUserId: null,
      expiresAt,
      createdAt: new Date(),
    };
    await this.prisma.phoneVerification.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
    });
    return {
      phone,
      expiresAt,
      url: `https://t.me/${this.config.username}?start=${token}`,
    };
  }

  // One message to the bot → the reply, or nothing for messages it ignores
  async handle(update: TelegramUpdate): Promise<TelegramReply | undefined> {
    const message = update.message;
    // Contacts can only be shared in a one-to-one chat with the bot
    if (!message?.from || message.chat.type !== 'private') return undefined;
    const reply = (text: string, reply_markup?: object): TelegramReply => ({
      method: 'sendMessage',
      chat_id: message.chat.id,
      text,
      ...(reply_markup && { reply_markup }),
    });
    const telegramUserId = String(message.from.id);

    if (message.contact) {
      // A contact card forwarded from someone else has their user_id, not the sender's
      if (message.contact.user_id !== message.from.id)
        return reply(
          'Please tap "Share my phone number" to send your own number, not a contact.',
        );
      const pending = await this.prisma.phoneVerification.findUnique({
        where: { telegramUserId },
      });
      if (!pending || pending.expiresAt <= new Date())
        return reply(
          'This check has expired. Start again in SplitLah: Profile, PayNow number, Check with Telegram.',
          noKeyboard,
        );

      const shared = `+${message.contact.phone_number.replace(/\D/g, '')}`;
      if (shared !== pending.phone)
        return reply(
          `This Telegram account's number is not ${pretty(pending.phone)}. Open the link on the phone that uses that number, or change the number in SplitLah.`,
          noKeyboard,
        );

      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: pending.userId },
          data: { paynowMobile: pending.phone, phoneVerifiedAt: new Date() },
        }),
        this.prisma.phoneVerification.delete({
          where: { userId: pending.userId },
        }),
      ]);
      this.logger.log('number checked by Telegram');
      return reply(
        `Checked ✓ ${pretty(pending.phone)} is now your PayNow number in SplitLah. You can go back to the app.`,
        noKeyboard,
      );
    }

    const start = /^\/start(?:\s+([\w-]+))?/.exec(message.text ?? '');
    const token = start?.[1];
    if (token) {
      const pending = await this.prisma.phoneVerification.findUnique({
        where: { linkHash: hashOf(token) },
      });
      if (!pending || pending.expiresAt <= new Date())
        return reply(
          'This link has expired. Start again in SplitLah: Profile, PayNow number, Check with Telegram.',
        );
      // One waiting check per Telegram account: the newest link wins
      await this.prisma.$transaction([
        this.prisma.phoneVerification.updateMany({
          where: { telegramUserId, NOT: { userId: pending.userId } },
          data: { telegramUserId: null },
        }),
        this.prisma.phoneVerification.update({
          where: { userId: pending.userId },
          data: { telegramUserId },
        }),
      ]);
      return reply(
        `Tap the button below to share this Telegram account's number. SplitLah checks that it is ${pretty(pending.phone)}.`,
        {
          keyboard: [
            [{ text: 'Share my phone number', request_contact: true }],
          ],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      );
    }

    return reply(
      'This bot checks your PayNow number for SplitLah. Open SplitLah, go to Profile, PayNow number, and tap Check with Telegram.',
    );
  }
}
