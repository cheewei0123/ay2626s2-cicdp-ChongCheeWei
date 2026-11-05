import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Two fresh users each run: the owner, and someone who must not see the owner's bill
const run = Date.now();
const ownerEmail = `e2e-bills-owner-${run}@example.com`;
const otherEmail = `e2e-bills-other-${run}@example.com`;

describe('Bills and items (e2e, real database)', () => {
  let app: NestExpressApplication;
  let owner: string;
  let other: string;

  async function registerToken(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'correct horse', displayName: 'Tester' })
      .expect(201);
    return `Bearer ${res.body.accessToken}`;
  }

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
    owner = await registerToken(ownerEmail);
    other = await registerToken(otherEmail);
  });

  afterAll(async () => {
    // Bills first (they point at the owner), then the two test users
    const prisma = app.get(PrismaService);
    await prisma.bill.deleteMany({ where: { owner: { email: ownerEmail } } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });
    await app.close();
    vi.restoreAllMocks();
  });

  it('create bill → add 3 items → edit one → delete one', async () => {
    const server = app.getHttpServer();

    const bill = await request(server)
      .post('/api/bills')
      .set('Authorization', owner)
      .send({ title: 'Dinner', merchant: 'Maxwell' })
      .expect(201);
    expect(bill.body).toMatchObject({
      status: 'OPEN',
      serviceBp: 1000,
      gstBp: 900,
    });
    expect(bill.body.shareToken).toHaveLength(22);
    const items = `/api/bills/${bill.body.id}/items`;

    const added = [];
    for (const item of [
      { name: 'Chicken Rice', unitPriceCents: 600 },
      { name: 'Laksa', unitPriceCents: 750 },
      { name: 'Tiger', unitPriceCents: 800, quantity: 2 },
    ]) {
      const res = await request(server)
        .post(items)
        .set('Authorization', owner)
        .send(item)
        .expect(201);
      added.push(res.body);
    }
    expect(added[0].quantity).toBe(1);

    // The brief's bill: 2950 + 295 service + 292 GST = 3537
    const full = await request(server)
      .get(`/api/bills/${bill.body.id}`)
      .set('Authorization', owner)
      .expect(200);
    expect(full.body.items).toHaveLength(3);
    expect(full.body.totals).toEqual({
      subtotalCents: 2950,
      serviceCents: 295,
      gstCents: 292,
      totalCents: 3537,
      total: '$35.37',
    });

    const edited = await request(server)
      .patch(`${items}/${added[1].id}`)
      .set('Authorization', owner)
      .send({ unitPriceCents: 800 })
      .expect(200);
    expect(edited.body).toMatchObject({ name: 'Laksa', unitPriceCents: 800 });

    await request(server)
      .delete(`${items}/${added[0].id}`)
      .set('Authorization', owner)
      .expect(204);

    const after = await request(server)
      .get(`/api/bills/${bill.body.id}`)
      .set('Authorization', owner)
      .expect(200);
    expect(after.body.items.map((i: { name: string }) => i.name)).toEqual([
      'Laksa',
      'Tiger',
    ]);
    expect(after.body.totals.subtotalCents).toBe(2400);

    const mine = await request(server)
      .get('/api/bills')
      .set('Authorization', owner)
      .expect(200);
    expect(mine.body.map((b: { id: string }) => b.id)).toContain(bill.body.id);
  });

  it.each([0, -100, 1.5])(
    'rejects a price of %s with 400',
    async (unitPriceCents) => {
      const bill = await request(app.getHttpServer())
        .post('/api/bills')
        .set('Authorization', owner)
        .send({ title: 'Price test' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/bills/${bill.body.id}/items`)
        .set('Authorization', owner)
        .send({ name: 'Bad', unitPriceCents })
        .expect(400);
    },
  );

  it("hides one user's bill from another (404, not 403, so ids can't be probed)", async () => {
    const server = app.getHttpServer();
    const bill = await request(server)
      .post('/api/bills')
      .set('Authorization', owner)
      .send({ title: 'Private' })
      .expect(201);

    await request(server)
      .get(`/api/bills/${bill.body.id}`)
      .set('Authorization', other)
      .expect(404);
    await request(server)
      .post(`/api/bills/${bill.body.id}/items`)
      .set('Authorization', other)
      .send({ name: 'Sneaky', unitPriceCents: 100 })
      .expect(404);
    const theirs = await request(server)
      .get('/api/bills')
      .set('Authorization', other)
      .expect(200);
    expect(theirs.body).toEqual([]);
  });

  it('answers 404 for an item from a different bill', async () => {
    const server = app.getHttpServer();
    const a = await request(server)
      .post('/api/bills')
      .set('Authorization', owner)
      .send({ title: 'A' })
      .expect(201);
    const b = await request(server)
      .post('/api/bills')
      .set('Authorization', owner)
      .send({ title: 'B' })
      .expect(201);
    const item = await request(server)
      .post(`/api/bills/${a.body.id}/items`)
      .set('Authorization', owner)
      .send({ name: 'Kopi', unitPriceCents: 150 })
      .expect(201);

    await request(server)
      .patch(`/api/bills/${b.body.id}/items/${item.body.id}`)
      .set('Authorization', owner)
      .send({ quantity: 2 })
      .expect(404);
  });

  it('answers 409 when changing items on a locked bill', async () => {
    const server = app.getHttpServer();
    const bill = await request(server)
      .post('/api/bills')
      .set('Authorization', owner)
      .send({ title: 'Locked' })
      .expect(201);
    // Locking has its own endpoint later (KAN-28); here the test sets it directly
    await app
      .get(PrismaService)
      .bill.update({ where: { id: bill.body.id }, data: { status: 'LOCKED' } });

    const res = await request(server)
      .post(`/api/bills/${bill.body.id}/items`)
      .set('Authorization', owner)
      .send({ name: 'Late', unitPriceCents: 100 })
      .expect(409);
    expect(res.body.message).toBe('Bill is locked; unlock it to make changes');
  });

  it('needs a login token', async () => {
    await request(app.getHttpServer()).get('/api/bills').expect(401);
  });
});
