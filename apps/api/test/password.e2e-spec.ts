import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { EMAIL_SERVICE } from './../src/email/email.interface.js';
import { FakeEmailService } from './../src/email/fake-email.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const email = `e2e-password-${Date.now()}@example.com`;

// Forgot, reset and change password, against the real database (KAN-90)
describe('Passwords (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mail = new FakeEmailService();
  const server = () => app.getHttpServer();

  const login = (password: string) =>
    request(server()).post('/api/auth/login').send({ email, password });
  const lastLinkToken = () =>
    /reset-password\?token=([\w-]+)/.exec(mail.sent.at(-1)!.text)![1];

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SERVICE)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await request(server())
      .post('/api/auth/register')
      .send({ email, password: 'first password', displayName: 'Pat' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('answers 204 for an unknown email too, and sends nothing', async () => {
    const before = mail.sent.length;
    await request(server())
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody-here@example.com' })
      .expect(204);
    expect(mail.sent.length).toBe(before);
  });

  it('emails a link; resetting logs out old tokens; the link works once', async () => {
    const oldToken = (await login('first password').expect(200)).body
      .accessToken as string;

    await request(server())
      .post('/api/auth/forgot-password')
      .send({ email: email.toUpperCase() }) // emails are matched case-insensitively
      .expect(204);
    await vi.waitFor(() =>
      expect(mail.sent.at(-1)!.subject).toContain('Reset'),
    );
    const token = lastLinkToken();

    // Only the hash is stored, never the token from the link
    const stored = await prisma.passwordResetToken.findFirst({
      where: { user: { email } },
    });
    expect(stored!.tokenHash).not.toBe(token);

    await request(server())
      .post('/api/auth/reset-password')
      .send({ token, password: 'short' })
      .expect(400);
    await request(server())
      .post('/api/auth/reset-password')
      .send({ token, password: 'second password' })
      .expect(204);

    await login('first password').expect(401);
    await login('second password').expect(200);
    // A token made before the reset no longer works anywhere
    const me = await request(server())
      .get('/api/me')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);
    expect(me.body.message).toBe('Your session has ended. Log in again.');
    // Opening the emailed link also proved the email address
    expect(
      (await prisma.user.findUnique({ where: { email } }))!.emailVerifiedAt,
    ).not.toBeNull();

    const again = await request(server())
      .post('/api/auth/reset-password')
      .send({ token, password: 'third password' })
      .expect(400);
    expect(again.body.message).toContain('invalid or has expired');
  });

  it('changes the password when logged in, keeping this device logged in', async () => {
    const token = (await login('second password').expect(200)).body
      .accessToken as string;
    const auth = `Bearer ${token}`;

    await request(server())
      .post('/api/me/password')
      .set('Authorization', auth)
      .send({ currentPassword: 'wrong guess', newPassword: 'third password' })
      .expect(403); // the login is fine, so not 401

    const res = await request(server())
      .post('/api/me/password')
      .set('Authorization', auth)
      .send({
        currentPassword: 'second password',
        newPassword: 'third password',
      })
      .expect(200);

    // The old token is ended; the new one works
    await request(server())
      .get('/api/me')
      .set('Authorization', auth)
      .expect(401);
    await request(server())
      .get('/api/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    await login('third password').expect(200);
  });
});
