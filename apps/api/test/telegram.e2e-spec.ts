import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { TELEGRAM_CONFIG } from './../src/telegram/telegram.config.js';

const email = `e2e-telegram-${Date.now()}@example.com`;
const secret = 'e2e-webhook-secret-123';
const tgUser = 4_200_000_000 + Math.floor(Math.random() * 1000); // a Telegram user id

// Checking the PayNow number through the Telegram bot, against the real database (KAN-91).
// Telegram itself is played by this test: it posts the updates the bot would get.
describe('PayNow number check by Telegram (e2e)', () => {
  let app: NestExpressApplication;
  let token: string;
  const server = () => app.getHttpServer();
  const as = (method: 'get' | 'post', path: string) =>
    request(server())[method](path).set('Authorization', `Bearer ${token}`);
  const telegram = (message: object, header = secret) =>
    request(server())
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', header)
      .send({ update_id: 1, message });
  const chat = { id: tgUser, type: 'private' };
  const from = { id: tgUser, is_bot: false, first_name: 'Pat' };

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    // Startup tells Telegram the webhook address; nothing leaves this machine
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true })),
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_CONFIG)
      .useValue({ token: '1:test', username: 'SplitLahTestBot', secret })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    token = (
      await request(server())
        .post('/api/auth/register')
        .send({ email, password: 'correct horse', displayName: 'Pat' })
        .expect(201)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { email } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('says Telegram works here', async () => {
    const methods = await as('get', '/api/me/phone/methods').expect(200);
    expect(methods.body).toEqual({ telegram: true, sms: true });
  });

  it('refuses a webhook call without the secret', async () => {
    await telegram({ chat, from, text: '/start x' }, 'wrong').expect(401);
    await request(server())
      .post('/api/telegram/webhook')
      .send({ message: { chat, from, text: 'hi' } })
      .expect(401);
  });

  it('link → /start → share the number → the number is checked', async () => {
    const link = await as('post', '/api/me/phone/telegram')
      .send({ phone: '+6598765432' })
      .expect(200);
    const start = /\?start=([\w-]+)$/.exec(link.body.url)![1];
    expect(link.body.url).toMatch(/^https:\/\/t\.me\/SplitLahTestBot\?start=/);

    const asked = await telegram({
      chat,
      from,
      text: `/start ${start}`,
    }).expect(200);
    expect(asked.body).toMatchObject({
      method: 'sendMessage',
      chat_id: tgUser,
      reply_markup: { keyboard: [[{ request_contact: true }]] },
    });

    // Someone else's contact card, and then the wrong number: neither counts
    const card = await telegram({
      chat,
      from,
      contact: { phone_number: '6598765432', user_id: tgUser + 1 },
    }).expect(200);
    expect(card.body.text).toMatch(/not a contact/);
    const wrong = await telegram({
      chat,
      from,
      contact: { phone_number: '6591112222', user_id: tgUser },
    }).expect(200);
    expect(wrong.body.text).toMatch(/is not \+65 9876 5432/);
    expect(
      (await as('get', '/api/me').expect(200)).body.phoneVerifiedAt,
    ).toBeNull();

    const done = await telegram({
      chat,
      from,
      contact: { phone_number: '+6598765432', user_id: tgUser },
    }).expect(200);
    expect(done.body.text).toMatch(/^Checked ✓/);

    const me = await as('get', '/api/me').expect(200);
    expect(me.body.paynowMobile).toBe('+6598765432');
    expect(me.body.phoneVerifiedAt).not.toBeNull();

    // The link was used up, and the checked number can't be "checked" again
    const again = await telegram({
      chat,
      from,
      text: `/start ${start}`,
    }).expect(200);
    expect(again.body.text).toMatch(/^This link has expired/);
    await as('post', '/api/me/phone/telegram')
      .send({ phone: '+6598765432' })
      .expect(409);
  });

  it('answers an empty 200 to updates the bot ignores', async () => {
    const group = await telegram({
      chat: { id: -1, type: 'group' },
      from,
      text: 'hi',
    }).expect(200);
    expect(group.body).toEqual({});
  });
});
