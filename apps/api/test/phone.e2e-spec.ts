import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { FakeSmsService } from './../src/sms/fake-sms.service.js';
import { SMS_SERVICE } from './../src/sms/sms.interface.js';

const email = `e2e-phone-${Date.now()}@example.com`;

// Checking the PayNow number with an SMS code, against the real database (KAN-91).
// POST /me/phone allows 3 calls per 10 minutes per IP, so this file makes exactly 3.
describe('PayNow number check (e2e)', () => {
  let app: NestExpressApplication;
  let token: string;
  const sms = new FakeSmsService();
  const server = () => app.getHttpServer();
  const as = (method: 'get' | 'post' | 'delete', path: string) =>
    request(server())[method](path).set('Authorization', `Bearer ${token}`);
  const lastCode = () => /^(\d{6}) is your/.exec(sms.sent.at(-1)!.text)![1];

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_SERVICE)
      .useValue(sms)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    // A number typed in at sign-up is kept, but not checked yet
    token = (
      await request(server())
        .post('/api/auth/register')
        .send({
          email,
          password: 'correct horse',
          displayName: 'Pat',
          paynowMobile: '+6591234567',
        })
        .expect(201)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { email } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('texts a code; the old number stays until the right code moves the new one in', async () => {
    const before = await as('get', '/api/me').expect(200);
    expect(before.body).toMatchObject({
      paynowMobile: '+6591234567',
      phoneVerifiedAt: null,
    });

    const sent = await as('post', '/api/me/phone')
      .send({ phone: '+6598765432' })
      .expect(200);
    expect(sent.body).toEqual({
      phone: '+6598765432',
      expiresAt: expect.any(String),
    });
    expect(sms.sent.at(-1)!.to).toBe('+6598765432');
    const code = lastCode();

    // One SMS a minute per account
    const again = await as('post', '/api/me/phone')
      .send({ phone: '+6598765432' })
      .expect(429);
    expect(again.body.message).toMatch(/^Wait \d+ seconds/);

    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    const bad = await as('post', '/api/me/phone/verify')
      .send({ code: wrong })
      .expect(400);
    expect(bad.body.message).toBe('Wrong code. 4 tries left.');
    // Still the old, unchecked number
    expect((await as('get', '/api/me').expect(200)).body.paynowMobile).toBe(
      '+6591234567',
    );

    const verified = await as('post', '/api/me/phone/verify')
      .send({ code })
      .expect(200);
    expect(verified.body).toMatchObject({
      paynowMobile: '+6598765432',
      phoneVerifiedAt: expect.any(String),
    });
    expect(verified.body).not.toHaveProperty('passwordHash');

    // The code is used up
    const reused = await as('post', '/api/me/phone/verify')
      .send({ code })
      .expect(400);
    expect(reused.body.message).toBe(
      'This code has expired. Ask for a new one.',
    );
  });

  it('refuses a checked number again, a badly typed code, and removes the number', async () => {
    const same = await as('post', '/api/me/phone')
      .send({ phone: '+6598765432' })
      .expect(409);
    expect(same.body.message).toBe('This number is already checked');

    const typo = await as('post', '/api/me/phone/verify')
      .send({ code: '12a456' })
      .expect(400);
    expect(typo.body.message).toContain(
      'code must be the 6 digits from the SMS',
    );

    const removed = await as('delete', '/api/me/phone').expect(200);
    expect(removed.body).toMatchObject({
      paynowMobile: null,
      phoneVerifiedAt: null,
    });
  });
});
