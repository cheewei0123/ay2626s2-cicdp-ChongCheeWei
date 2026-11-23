import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { base32Decode, hotp, stepAt } from './../src/auth/totp.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const email = `e2e-mfa-${Date.now()}@example.com`;
const password = 'correct horse';

// Two-step login with an authenticator app, against the real database (KAN-92).
// This test plays the authenticator app: it makes codes from the secret.
// POST /auth/mfa allows 5 calls a minute per IP, so this file makes 4.
describe('Two-step login (e2e)', () => {
  let app: NestExpressApplication;
  let token: string;
  let secret: string;
  let backupCodes: string[];
  const server = () => app.getHttpServer();
  const as = (path: string) =>
    request(server()).post(path).set('Authorization', `Bearer ${token}`);
  const code = (steps = 0) =>
    hotp(base32Decode(secret), stepAt(Date.now()) + steps);
  const login = () =>
    request(server()).post('/api/auth/login').send({ email, password });
  const mfa = (mfaToken: string, value: string) =>
    request(server()).post('/api/auth/mfa').send({ mfaToken, code: value });

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    token = (
      await request(server())
        .post('/api/auth/register')
        .send({ email, password, displayName: 'Pat' })
        .expect(201)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { email } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('turns on with the password and a first code, and shows 10 backup codes once', async () => {
    // 403, not 401: a wrong password here must not end the login
    await as('/api/me/mfa/setup').send({ password: 'wrong' }).expect(403);
    const setup = await as('/api/me/mfa/setup').send({ password }).expect(200);
    secret = setup.body.secret;
    expect(setup.body.otpauthUrl).toContain(`secret=${secret}`);
    // The database never holds the secret as it is
    const row = await app
      .get(PrismaService)
      .user.findUniqueOrThrow({ where: { email } });
    expect(row.mfaSecret).not.toContain(secret);
    expect(row.mfaEnabledAt).toBeNull();

    await as('/api/me/mfa/enable').send({ code: '000000' }).expect(400);
    const enabled = await as('/api/me/mfa/enable')
      .send({ code: code() })
      .expect(200);
    backupCodes = enabled.body.backupCodes;
    expect(backupCodes).toHaveLength(10);

    const status = await request(server())
      .get('/api/me/mfa')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(status.body).toEqual({ on: true, backupCodesLeft: 10 });
  });

  it('the password alone is not a login any more; a code finishes it, once', async () => {
    const first = await login().expect(200);
    expect(first.body).toEqual({
      mfaRequired: true,
      mfaToken: expect.any(String),
    });
    expect(first.body).not.toHaveProperty('accessToken');
    // The half-way token can't be used as a login
    await request(server())
      .get('/api/me')
      .set('Authorization', `Bearer ${first.body.mfaToken}`)
      .expect(401);

    await mfa(first.body.mfaToken, '000000').expect(401);
    // The code used to turn it on can't be used again: the next one (30 s on) can
    const next = code(1);
    const done = await mfa(first.body.mfaToken, next).expect(200);
    expect(done.body.user.mfaEnabledAt).not.toBeNull();
    await request(server())
      .get('/api/me')
      .set('Authorization', `Bearer ${done.body.accessToken}`)
      .expect(200);

    // Seen over a shoulder: the same code doesn't work a second time
    const again = await login().expect(200);
    await mfa(again.body.mfaToken, next).expect(401);
  });

  it('a backup code logs in once, then turns two-step login off with the password', async () => {
    const step = await login().expect(200);
    const done = await mfa(
      step.body.mfaToken,
      backupCodes[0].toUpperCase(),
    ).expect(200);
    token = done.body.accessToken;

    await as('/api/me/mfa/disable')
      .send({ password, code: backupCodes[0] })
      .expect(403); // already used
    const off = await as('/api/me/mfa/disable')
      .send({ password, code: backupCodes[1] })
      .expect(200);
    expect(off.body.mfaEnabledAt).toBeNull();

    const plain = await login().expect(200);
    expect(plain.body.accessToken).toEqual(expect.any(String));
  });
});
