import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { EMAIL_SERVICE } from './../src/email/email.interface.js';
import { FakeEmailService } from './../src/email/fake-email.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const email = `e2e-verify-${Date.now()}@example.com`;

describe('Email verification (e2e, real database, Fake email)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: string;
  // The fake sender keeps every email, so the test can open the link like a person would
  const inbox = new FakeEmailService();
  const api = () => request(app.getHttpServer());
  const lastToken = () =>
    /verify\?token=([\w-]+)/.exec(inbox.sent.at(-1)!.text)![1];
  const newBill = () =>
    api()
      .post('/api/bills')
      .set('Authorization', owner)
      .send({ title: 'Lunch' });

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SERVICE)
      .useValue(inbox)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const res = await api()
      .post('/api/auth/register')
      .send({ email, password: 'correct horse', displayName: 'Chee' })
      .expect(201);
    owner = `Bearer ${res.body.accessToken}`;
  });

  afterAll(async () => {
    // Tokens and bills go with the user (onDelete: Cascade)
    await prisma.bill.deleteMany({ where: { owner: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('emails a link on sign-up and blocks new bills and expenses until it is opened', async () => {
    expect(inbox.sent).toHaveLength(1);
    expect(inbox.sent[0].to).toBe(email);

    const blocked = await newBill().expect(403);
    expect(blocked.body.message).toMatch(/^Verify your email first/);
    await api()
      .post('/api/expenses')
      .set('Authorization', owner)
      .send({
        amountCents: 500,
        merchant: 'Kopi',
        category: 'FOOD_DRINKS',
        spentAt: '2026-11-22',
      })
      .expect(403);
    // Reading is still fine, so the home screen loads
    await api().get('/api/bills').set('Authorization', owner).expect(200);
  });

  it('rejects a made-up token and an expired one with 400', async () => {
    await api()
      .post('/api/auth/verify-email')
      .send({ token: 'x'.repeat(43) })
      .expect(400);

    await api()
      .post('/api/auth/resend-verification')
      .set('Authorization', owner)
      .expect(204);
    await prisma.emailVerificationToken.updateMany({
      where: { user: { email }, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await api()
      .post('/api/auth/verify-email')
      .send({ token: lastToken() })
      .expect(400);
    expect(res.body.message).toMatch(/invalid or has expired/);
  });

  it('"Send again" → open the new link → can create a bill; the link works only once', async () => {
    await api()
      .post('/api/auth/resend-verification')
      .set('Authorization', owner)
      .expect(204);
    const token = lastToken();

    await api().post('/api/auth/verify-email').send({ token }).expect(204);
    const me = await api()
      .get('/api/me')
      .set('Authorization', owner)
      .expect(200);
    expect(me.body.emailVerifiedAt).not.toBeNull();
    await newBill().expect(201);

    await api().post('/api/auth/verify-email').send({ token }).expect(400);
    await api()
      .post('/api/auth/resend-verification')
      .set('Authorization', owner)
      .expect(409);
  });

  // Three asks so far (2 links + the 409): the 4th within the hour is refused
  it('allows only 3 asks for a new link an hour, so no one can flood an inbox', async () => {
    await api()
      .post('/api/auth/resend-verification')
      .set('Authorization', owner)
      .expect(429);
  });
});
