import {
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  createTelegramConfig,
  registerWebhook,
  type TelegramConfig,
} from './telegram.config.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService, type TelegramUpdate } from './telegram.service.js';

const config: TelegramConfig = {
  token: '123456:ABC-def_789',
  username: 'SplitLahBot',
  secret: 'a-long-webhook-secret',
};
const env = {
  TELEGRAM_BOT_TOKEN: config.token,
  TELEGRAM_BOT_USERNAME: '@SplitLahBot',
  TELEGRAM_WEBHOOK_SECRET: config.secret,
};
const NOW = new Date('2026-11-23T02:00:00.000Z');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

describe('Telegram settings (KAN-91)', () => {
  it('is off with nothing set, and on with all three', () => {
    expect(createTelegramConfig({})).toBeNull();
    expect(createTelegramConfig(env)).toEqual(config); // the @ is dropped
  });

  it('stops at startup when a setting is missing or mistyped', () => {
    expect(() =>
      createTelegramConfig({ TELEGRAM_BOT_TOKEN: config.token }),
    ).toThrow(
      'Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET together',
    );
    expect(() =>
      createTelegramConfig({ ...env, TELEGRAM_BOT_TOKEN: 'not a token' }),
    ).toThrow('TELEGRAM_BOT_TOKEN should look like');
    expect(() =>
      createTelegramConfig({ ...env, TELEGRAM_BOT_USERNAME: 'SplitLah' }),
    ).toThrow('TELEGRAM_BOT_USERNAME should be the bot name');
    expect(() =>
      createTelegramConfig({ ...env, TELEGRAM_WEBHOOK_SECRET: 'short' }),
    ).toThrow('TELEGRAM_WEBHOOK_SECRET should be 16 to 256');
  });

  it('points Telegram at /api/telegram/webhook with the secret', async () => {
    const post = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    const result = await registerWebhook(
      config,
      'https://splitlah.duckdns.org/',
      post as unknown as typeof fetch,
    );

    expect(result).toBe(
      'webhook set to https://splitlah.duckdns.org/api/telegram/webhook',
    );
    const [url, init] = post.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${config.token}/setWebhook`);
    expect(JSON.parse(init.body)).toEqual({
      url: 'https://splitlah.duckdns.org/api/telegram/webhook',
      secret_token: config.secret,
      allowed_updates: ['message'],
    });
  });

  it('skips a local http address, which Telegram would refuse', async () => {
    const post = vi.fn();
    expect(
      await registerWebhook(config, 'http://localhost:5173', post as never),
    ).toBe('webhook not set: Telegram needs an https APP_URL');
    expect(post).not.toHaveBeenCalled();
  });

  it('reports a refusal or a network error instead of crashing the app', async () => {
    const refused = vi.fn().mockResolvedValue({
      status: 401,
      json: () => Promise.resolve({ ok: false, description: 'Unauthorized' }),
    });
    expect(
      await registerWebhook(config, 'https://x.test', refused as never),
    ).toBe('webhook not set: Unauthorized');
    const bare = vi.fn().mockResolvedValue({
      status: 502,
      json: () => Promise.resolve({ ok: false }),
    });
    expect(await registerWebhook(config, 'https://x.test', bare as never)).toBe(
      'webhook not set: 502',
    );
    const offline = vi
      .fn()
      .mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    expect(
      await registerWebhook(config, 'https://x.test', offline as never),
    ).toBe('webhook not set: getaddrinfo ENOTFOUND');
  });
});

describe('TelegramService (KAN-91)', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    phoneVerification: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const service = (settings: TelegramConfig | null = config) =>
    new TelegramService(prisma as unknown as PrismaService, settings);
  const waiting = (more: object = {}) => ({
    userId: 'u1',
    phone: '+6598765432',
    telegramUserId: '777',
    expiresAt: new Date(NOW.getTime() + 5 * 60_000),
    ...more,
  });
  const chat = { id: 555, type: 'private' };
  const from = { id: 777 };
  const text = (value: string): TelegramUpdate => ({
    message: { chat, from, text: value },
  });
  const contact = (phone_number: string, user_id = 777): TelegramUpdate => ({
    message: { chat, from, contact: { phone_number, user_id } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    prisma.user.findUnique.mockResolvedValue({
      paynowMobile: '+6591234567',
      phoneVerifiedAt: NOW,
    });
    prisma.phoneVerification.findUnique.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('startLink', () => {
    it('gives a one-time t.me link and stores only its hash, for 10 minutes', async () => {
      const result = await service().startLink('u1', '+6598765432');

      expect(result.phone).toBe('+6598765432');
      expect(result.expiresAt).toEqual(new Date('2026-11-23T02:10:00.000Z'));
      const token = /^https:\/\/t\.me\/SplitLahBot\?start=([\w-]{32})$/.exec(
        result.url,
      )![1];
      const saved = prisma.phoneVerification.upsert.mock.calls[0][0];
      expect(saved.create).toMatchObject({
        userId: 'u1',
        phone: '+6598765432',
        codeHash: null, // a waiting SMS code stops working
        linkHash: hash(token),
        telegramUserId: null,
      });
      expect(JSON.stringify(saved)).not.toContain(token);
    });

    it('refuses when the bot is off, or the number is already checked', async () => {
      await expect(
        service(null).startLink('u1', '+6598765432'),
      ).rejects.toThrow(ServiceUnavailableException);
      await expect(service().startLink('u1', '+6591234567')).rejects.toThrow(
        new ConflictException('This number is already checked'),
      );
    });
  });

  describe('handle', () => {
    it('/start with a live link ties it to this Telegram account and asks for the number', async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(
        waiting({ telegramUserId: null }),
      );
      const reply = await service().handle(text('/start tok-en_1'));

      expect(prisma.phoneVerification.findUnique).toHaveBeenCalledWith({
        where: { linkHash: hash('tok-en_1') },
      });
      // Another waiting check from this account lets go first: the newest link wins
      expect(prisma.phoneVerification.updateMany).toHaveBeenCalledWith({
        where: { telegramUserId: '777', NOT: { userId: 'u1' } },
        data: { telegramUserId: null },
      });
      expect(prisma.phoneVerification.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { telegramUserId: '777' },
      });
      expect(reply).toMatchObject({
        method: 'sendMessage',
        chat_id: 555,
        text: expect.stringContaining('+65 9876 5432'),
        reply_markup: {
          keyboard: [
            [{ text: 'Share my phone number', request_contact: true }],
          ],
        },
      });
    });

    it('/start with an unknown or old link says to start again', async () => {
      expect((await service().handle(text('/start nope')))?.text).toMatch(
        /^This link has expired/,
      );
      prisma.phoneVerification.findUnique.mockResolvedValue(
        waiting({ expiresAt: NOW }),
      );
      expect((await service().handle(text('/start old')))?.text).toMatch(
        /^This link has expired/,
      );
      expect(prisma.phoneVerification.update).not.toHaveBeenCalled();
    });

    it('the shared number, when it matches, becomes the checked PayNow number', async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(waiting());
      const reply = await service().handle(contact('6598765432'));

      expect(prisma.phoneVerification.findUnique).toHaveBeenCalledWith({
        where: { telegramUserId: '777' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { paynowMobile: '+6598765432', phoneVerifiedAt: NOW },
      });
      expect(prisma.phoneVerification.delete).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(reply).toMatchObject({
        text: expect.stringMatching(/^Checked ✓ \+65 9876 5432/),
        reply_markup: { remove_keyboard: true },
      });
    });

    it('a different number changes nothing', async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(waiting());
      const reply = await service().handle(contact('+65 9111 2222'));
      expect(reply?.text).toMatch(/^This Telegram account's number is not/);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("someone else's contact card is refused, even with the right number", async () => {
      prisma.phoneVerification.findUnique.mockResolvedValue(waiting());
      const reply = await service().handle(contact('6598765432', 999));
      expect(reply?.text).toMatch(/send your own number, not a contact/);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('a contact with no check waiting, or an old one, says to start again', async () => {
      expect((await service().handle(contact('6598765432')))?.text).toMatch(
        /^This check has expired/,
      );
      prisma.phoneVerification.findUnique.mockResolvedValue(
        waiting({ expiresAt: NOW }),
      );
      expect((await service().handle(contact('6598765432')))?.text).toMatch(
        /^This check has expired/,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('explains itself to any other message, and ignores groups and empty updates', async () => {
      expect((await service().handle(text('hello')))?.text).toMatch(
        /^This bot checks your PayNow number/,
      );
      expect((await service().handle(text('/start')))?.text).toMatch(
        /^This bot checks/,
      );
      expect(
        await service().handle({
          message: { chat: { id: 1, type: 'group' }, from, text: 'hi' },
        }),
      ).toBeUndefined();
      expect(await service().handle({})).toBeUndefined();
    });
  });

  it('registers the webhook at startup only when the bot is on', async () => {
    vi.stubEnv('APP_URL', 'https://splitlah.test');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    } as Response);
    await service(null).onApplicationBootstrap();
    expect(fetchSpy).not.toHaveBeenCalled();
    await service().onApplicationBootstrap();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'webhook set to https://splitlah.test/api/telegram/webhook',
    );
    fetchSpy.mockRestore();
  });

  it('says whether it is on, and its secret', () => {
    expect(service().enabled).toBe(true);
    expect(service().secret).toBe(config.secret);
    expect(service(null).enabled).toBe(false);
    expect(service(null).secret).toBeNull();
  });
});

describe('TelegramController (KAN-91)', () => {
  const handle = vi.fn();
  const controller = (secret: string | null) =>
    new TelegramController({ secret, handle } as unknown as TelegramService);

  beforeEach(() => handle.mockReset());

  it('answers 404 while the bot is off, and 401 without the right secret', async () => {
    await expect(controller(null).webhook('x', {})).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      controller('right-secret').webhook(undefined, {}),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      controller('right-secret').webhook('wrong', {}),
    ).rejects.toThrow(UnauthorizedException);
    expect(handle).not.toHaveBeenCalled();
  });

  it('with the secret, answers with the reply, or an empty object for none', async () => {
    handle.mockResolvedValueOnce({ method: 'sendMessage' });
    expect(
      await controller('right-secret').webhook('right-secret', {}),
    ).toEqual({
      method: 'sendMessage',
    });
    handle.mockResolvedValueOnce(undefined);
    expect(
      await controller('right-secret').webhook('right-secret', {}),
    ).toEqual({});
  });
});
