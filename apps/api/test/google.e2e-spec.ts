import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  GOOGLE_VERIFIER,
  type GoogleProfile,
  type GoogleVerifier,
} from './../src/auth/google.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const stamp = Date.now();
const newEmail = `e2e-google-new-${stamp}@example.com`;
const victim = `e2e-google-victim-${stamp}@example.com`;
const password = 'correct horse';

// A real ID token needs a real Google login, so this fake Google accepts a
// JWT-shaped string whose middle part is the profile (Google's library is unit-tested)
const fakeGoogle: GoogleVerifier = {
  clientId: 'e2e.apps.googleusercontent.com',
  verify: async (credential) => {
    if (credential.endsWith('.bad')) throw new Error('bad signature');
    return JSON.parse(
      Buffer.from(credential.split('.')[1], 'base64url').toString(),
    ) as GoogleProfile;
  },
};
const idToken = (p: Partial<GoogleProfile> & { email: string }, sig = 'sig') =>
  `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(
    JSON.stringify({
      sub: `g-${p.email}`,
      emailVerified: true,
      name: 'Pat',
      ...p,
    }),
  ).toString('base64url')}.${sig}`;

// "Continue with Google", against the real database (KAN-95)
describe('Google sign-in (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();
  const google = (credential: string) =>
    request(server()).post('/api/auth/google').send({ credential });

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_VERIFIER)
      .useValue(fakeGoogle)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [newEmail, victim] } },
    });
    await app.close();
    vi.restoreAllMocks();
  });

  it('tells the web app the client ID, and checks the body', async () => {
    await request(server())
      .get('/api/auth/google')
      .expect(200, { clientId: 'e2e.apps.googleusercontent.com' });
    await google('not-a-token').expect(400);
    await google(idToken({ email: newEmail }, 'bad')).expect(401);
    await google(idToken({ email: newEmail, emailVerified: false })).expect(
      401,
    );
  });

  it('a new email makes a verified account that has no password yet', async () => {
    const res = await google(idToken({ email: newEmail })).expect(200);
    expect(res.body.user).toMatchObject({
      email: newEmail,
      displayName: 'Pat',
      hasPassword: false,
    });
    expect(res.body.user.emailVerifiedAt).not.toBeNull();
    await request(server())
      .get('/api/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    // Signing in again finds the same account
    const again = await google(idToken({ email: newEmail })).expect(200);
    expect(again.body.user.id).toBe(res.body.user.id);
  });

  it('someone who signed up first with your email loses access when you use Google', async () => {
    const early = await request(server())
      .post('/api/auth/register')
      .send({ email: victim, password, displayName: 'Not you' })
      .expect(201);

    const res = await google(idToken({ email: victim })).expect(200);
    expect(res.body.user.id).toBe(early.body.user.id);
    expect(res.body.user.hasPassword).toBe(false);
    // Their token and their password no longer work
    await request(server())
      .get('/api/me')
      .set('Authorization', `Bearer ${early.body.accessToken}`)
      .expect(401);
    await request(server())
      .post('/api/auth/login')
      .send({ email: victim, password })
      .expect(401);
  });

  it('two-step login still applies, and a deleted account cannot sign in', async () => {
    await prisma.user.update({
      where: { email: victim },
      data: { mfaEnabledAt: new Date() },
    });
    const res = await google(idToken({ email: victim })).expect(200);
    expect(res.body).toEqual({
      mfaRequired: true,
      mfaToken: expect.any(String),
    });

    await prisma.user.update({
      where: { email: victim },
      data: { deletedAt: new Date() },
    });
    const gone = await google(idToken({ email: victim })).expect(401);
    expect(gone.body.message).toBe('This account has been deleted');
  });
});
