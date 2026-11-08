import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const ownerEmail = `e2e-summary-${Date.now()}@example.com`;

type Person = { displayName: string; totalCents: number; total: string };

describe('Summary (e2e, real database)', () => {
  let app: NestExpressApplication;
  let owner: string;
  let bill: { id: string; shareToken: string };
  const items: Record<string, string> = {};
  const guests: Record<string, string> = {};

  const server = () => app.getHttpServer();
  const ownerSummary = () =>
    request(server())
      .get(`/api/bills/${bill.id}/summary`)
      .set('Authorization', owner)
      .expect(200);
  const totalsByName = (people: Person[]) =>
    Object.fromEntries(people.map((p) => [p.displayName, p.totalCents]));

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

    // Chee owns the bill and has a PayNow number
    const res = await request(server())
      .post('/api/auth/register')
      .send({
        email: ownerEmail,
        password: 'correct horse',
        displayName: 'Chee',
        paynowMobile: '+6591234567',
      })
      .expect(201);
    owner = `Bearer ${res.body.accessToken}`;
    bill = (
      await request(server())
        .post('/api/bills')
        .set('Authorization', owner)
        .send({ title: 'Maxwell' })
        .expect(201)
    ).body;

    // The brief's bill
    for (const [name, unitPriceCents, quantity] of [
      ['Chicken Rice', 600, 1],
      ['Laksa', 750, 1],
      ['Tiger', 800, 2],
    ] as const) {
      const item = await request(server())
        .post(`/api/bills/${bill.id}/items`)
        .set('Authorization', owner)
        .send({ name, unitPriceCents, quantity })
        .expect(201);
      items[name] = item.body.id;
    }
    for (const name of ['Ali', 'Ben', 'Dan']) {
      const joined = await request(server())
        .post(`/api/share/${bill.shareToken}/participants`)
        .send({ displayName: name })
        .expect(201);
      guests[name] = joined.body.guestToken;
    }
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.bill.deleteMany({ where: { owner: { email: ownerEmail } } });
    await prisma.user.deleteMany({ where: { email: ownerEmail } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('with nothing claimed yet, the owner pays everything and it shows as unclaimed', async () => {
    const res = await ownerSummary();
    expect(res.body.unclaimedCents).toBe(2950);
    expect(totalsByName(res.body.people)).toEqual({
      Chee: 3537,
      Ali: 0,
      Ben: 0,
      Dan: 0,
    });
    expect(res.body.people[0]).toMatchObject({
      displayName: 'Chee',
      isOwner: true,
    });
  });

  it("the brief's example: Chee 720, Ali 899, Ben 959, Dan 959, total 3537", async () => {
    // Chee (the owner) claims through the owner route; guests through the share link
    await request(server())
      .post(`/api/bills/${bill.id}/claims`)
      .set('Authorization', owner)
      .send({ itemId: items['Chicken Rice'] })
      .expect(201);
    for (const [name, item] of [
      ['Ali', 'Laksa'],
      ['Ben', 'Tiger'],
      ['Dan', 'Tiger'],
    ]) {
      await request(server())
        .post(`/api/share/${bill.shareToken}/claims`)
        .set('X-Guest-Token', guests[name])
        .send({ itemId: items[item] })
        .expect(201);
    }

    const res = await ownerSummary();
    expect(totalsByName(res.body.people)).toEqual({
      Chee: 720,
      Ali: 899,
      Ben: 959,
      Dan: 959,
    });
    expect(res.body).toMatchObject({
      subtotalCents: 2950,
      serviceCents: 295,
      gstCents: 292,
      totalCents: 3537,
      total: '$35.37',
      unclaimedCents: 0,
    });
    expect(res.body.people.map((p: Person) => p.total)).toEqual([
      '$7.20',
      '$8.99',
      '$9.59',
      '$9.59',
    ]);
    // Per-person totals always add up to the bill total
    expect(
      res.body.people.reduce((a: number, p: Person) => a + p.totalCents, 0),
    ).toBe(3537);
    expect(res.body).not.toHaveProperty('paynow');
  });

  it("guests see the same numbers plus the owner's PayNow number", async () => {
    const res = await request(server())
      .get(`/api/share/${bill.shareToken}/summary`)
      .expect(200);
    expect(totalsByName(res.body.people)).toEqual({
      Chee: 720,
      Ali: 899,
      Ben: 959,
      Dan: 959,
    });
    expect(res.body.paynow).toEqual({ mobile: '+6591234567' });
    // Still no private data for guests
    expect(JSON.stringify(res.body)).not.toContain(ownerEmail);
  });

  it('an unclaimed item shows in unclaimedCents and moves to the owner', async () => {
    await request(server())
      .delete(`/api/share/${bill.shareToken}/claims/${items.Laksa}`)
      .set('X-Guest-Token', guests.Ali)
      .expect(204);

    const res = await ownerSummary();
    expect(res.body.unclaimedCents).toBe(750);
    expect(totalsByName(res.body.people)).toMatchObject({
      Ali: 0,
      Ben: 959,
      Dan: 959,
    });
    expect(
      res.body.people.reduce((a: number, p: Person) => a + p.totalCents, 0),
    ).toBe(3537);
  });

  it('the owner participant is only created once', async () => {
    await ownerSummary();
    const owners = await app.get(PrismaService).participant.count({
      where: { billId: bill.id, displayName: 'Chee' },
    });
    expect(owners).toBe(1);
  });

  it('only the owner gets the owner summary', async () => {
    await request(server()).get(`/api/bills/${bill.id}/summary`).expect(401);
  });
});
