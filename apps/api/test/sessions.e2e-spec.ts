import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const email = `e2e-sessions-${Date.now()}@example.com`;
const password = 'correct horse';

// 14-day logins that can be ended one at a time, against the real database (KAN-97)
describe('Sessions (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();
  const me = (token: string) =>
    request(server()).get('/api/me').set('Authorization', `Bearer ${token}`);
  const login = async () =>
    (
      await request(server())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;

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
    prisma = app.get(PrismaService);
    await request(server())
      .post('/api/auth/register')
      .send({ email, password, displayName: 'Pat' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('a login lasts 14 days', async () => {
    const token = await login();
    const { exp, iat, sid } = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    );
    expect(exp - iat).toBe(14 * 24 * 60 * 60);
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sid },
    });
    const days = (session.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.99);
    expect(days).toBeLessThanOrEqual(14);
  });

  it('logout ends this login on the server; the other device stays in', async () => {
    const phone = await login();
    const laptop = await login();
    await me(phone).expect(200);

    await request(server())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${phone}`)
      .expect(204);

    const after = await me(phone).expect(401);
    expect(after.body.message).toBe('Your session has ended. Log in again.');
    await me(laptop).expect(200);
    await request(server()).post('/api/auth/logout').expect(401);
  });

  it('a session that has run out is refused, and cleared at the next login', async () => {
    const token = await login();
    const { sid } = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    );
    await prisma.session.update({
      where: { id: sid },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await me(token).expect(401);

    await login();
    expect(await prisma.session.findUnique({ where: { id: sid } })).toBeNull();
  });
});
