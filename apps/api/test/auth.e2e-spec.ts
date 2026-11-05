import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// A fresh email each run, so the test never clashes with old data
const email = `e2e-${Date.now()}@example.com`;
const password = 'correct horse';

describe('Auth (e2e, real database)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    // Remove the test user so the database stays clean
    await app.get(PrismaService).user.deleteMany({ where: { email } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('register → login → protected route works with the token and not without', async () => {
    const server = app.getHttpServer();

    const registered = await request(server)
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password, displayName: 'Chee' })
      .expect(201);
    expect(registered.body.user).toMatchObject({ email, displayName: 'Chee' });
    expect(registered.body.user).not.toHaveProperty('passwordHash');

    const loggedIn = await request(server)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const token = loggedIn.body.accessToken;

    const me = await request(server)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, displayName: 'Chee' });
    expect(me.body).not.toHaveProperty('passwordHash');

    await request(server).get('/api/me').expect(401);
    await request(server)
      .get('/api/me')
      .set('Authorization', 'Bearer not.a.token')
      .expect(401);
  });

  it('answers 409 when the email is already registered', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, displayName: 'Someone else' })
      .expect(409);
    expect(res.body.message).toBe('Email is already registered');
  });

  it('answers 401 with one message for a wrong password or unknown email', async () => {
    const server = app.getHttpServer();
    const wrong = await request(server)
      .post('/api/auth/login')
      .send({ email, password: 'wrong password' })
      .expect(401);
    const unknown = await request(server)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password })
      .expect(401);
    expect(wrong.body.message).toBe('Invalid email or password');
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('answers 400 with clear messages for a bad email and a short password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', displayName: 'Chee' })
      .expect(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'email must be a valid email address',
        'password must be at least 8 characters',
      ]),
    );
  });

  it('rejects fields that are not in the DTO', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, displayName: 'Chee', isAdmin: true })
      .expect(400);
    expect(res.body.message).toContain('property isAdmin should not exist');
  });
});
