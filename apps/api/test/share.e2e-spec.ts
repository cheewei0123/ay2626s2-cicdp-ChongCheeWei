import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const ownerEmail = `e2e-share-${Date.now()}@example.com`;

describe('Share link and guest join (e2e, real database)', () => {
  let app: NestExpressApplication;
  let owner: string;
  let bill: { id: string; shareToken: string; joinCode: string };

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

    const server = app.getHttpServer();
    const res = await request(server)
      .post('/api/auth/register')
      .send({
        email: ownerEmail,
        password: 'correct horse',
        displayName: 'Chee',
      })
      .expect(201);
    owner = `Bearer ${res.body.accessToken}`;
    bill = (
      await request(server)
        .post('/api/bills')
        .set('Authorization', owner)
        .send({ title: 'Dinner at Maxwell' })
        .expect(201)
    ).body;
    await request(server)
      .post(`/api/bills/${bill.id}/items`)
      .set('Authorization', owner)
      .send({ name: 'Laksa', unitPriceCents: 750 })
      .expect(201);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.bill.deleteMany({ where: { owner: { email: ownerEmail } } });
    await prisma.user.deleteMany({ where: { email: ownerEmail } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('answers 404 for a wrong share token', async () => {
    await request(app.getHttpServer())
      .get('/api/share/not-a-real-token')
      .expect(404);
  });

  it('shows the bill to a guest without private fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/share/${bill.shareToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      title: 'Dinner at Maxwell',
      owner: { displayName: 'Chee' },
      joinCode: bill.joinCode,
    });
    expect(res.body.items[0]).toMatchObject({
      name: 'Laksa',
      unitPriceCents: 750,
    });
    expect(res.body.totals.totalCents).toBeGreaterThan(750);
    // Nothing that identifies the owner's account or lets someone act as them
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(ownerEmail);
    expect(res.body).not.toHaveProperty('ownerId');
    expect(res.body).not.toHaveProperty('shareToken');
  });

  it('lets friends join with just a name, and numbers repeated names', async () => {
    const server = app.getHttpServer();
    const join = (displayName: string) =>
      request(server)
        .post(`/api/share/${bill.shareToken}/participants`)
        .send({ displayName });

    const ben = await join('Ben').expect(201);
    const ben2 = await join('  Ben ').expect(201);
    expect(ben.body.participant.displayName).toBe('Ben');
    expect(ben2.body.participant.displayName).toBe('Ben (2)');
    expect(ben.body.guestToken).toEqual(expect.any(String));

    const view = await request(server)
      .get(`/api/share/${bill.shareToken}`)
      .expect(200);
    expect(
      view.body.participants.map((p: { displayName: string }) => p.displayName),
    ).toEqual(['Ben', 'Ben (2)']);
    expect(view.body.participants[0]).not.toHaveProperty('userId');
  });

  it('does not accept a guest token as a login', async () => {
    const server = app.getHttpServer();
    const joined = await request(server)
      .post(`/api/share/${bill.shareToken}/participants`)
      .send({ displayName: 'Dan' })
      .expect(201);

    const res = await request(server)
      .get('/api/me')
      .set('Authorization', `Bearer ${joined.body.guestToken}`)
      .expect(401);
    expect(res.body.message).toBe('A guest token cannot be used to log in');
  });

  it('answers 400 for an empty name', async () => {
    await request(app.getHttpServer())
      .post(`/api/share/${bill.shareToken}/participants`)
      .send({ displayName: '   ' })
      .expect(400);
  });

  it('finds the share link from the join code, in any case', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/join/${bill.joinCode.toLowerCase()}`)
      .expect(200);
    expect(res.body).toEqual({ shareToken: bill.shareToken });
    await request(app.getHttpServer()).get('/api/join/ZZZZZ').expect(404);
  });

  it('answers 409 when joining a locked bill', async () => {
    await app.get(PrismaService).bill.update({
      where: { id: bill.id },
      data: { status: 'LOCKED' },
    });
    await request(app.getHttpServer())
      .post(`/api/share/${bill.shareToken}/participants`)
      .send({ displayName: 'Late' })
      .expect(409);
  });
});
