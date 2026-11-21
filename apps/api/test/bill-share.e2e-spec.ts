import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const stamp = Date.now();
const ownerEmail = `e2e-share-log-${stamp}@example.com`;
const benEmail = `e2e-share-log-ben-${stamp}@example.com`;

type Expense = {
  id: string;
  amountCents: number;
  category: string;
  merchant: string;
  source: string;
  billId: string;
};

describe('Locking a bill logs each share as an expense (e2e, real database)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: string;
  let ben: string;
  let bill: { id: string; shareToken: string };
  const items: Record<string, string> = {};
  const guests: Record<string, string> = {}; // name → guest token

  const server = () => app.getHttpServer();
  const post = (path: string, auth = owner) =>
    request(server()).post(path).set('Authorization', auth);
  // This person's bill shares for November 2026
  const shares = async (auth: string) =>
    (
      await request(server())
        .get('/api/expenses?month=2026-11')
        .set('Authorization', auth)
        .expect(200)
    ).body.items.filter((e: Expense) => e.billId === bill.id) as Expense[];

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
    prisma = app.get(PrismaService);

    const register = async (email: string, displayName: string) => {
      const res = await request(server())
        .post('/api/auth/register')
        .send({ email, password: 'correct horse', displayName })
        .expect(201);
      return { auth: `Bearer ${res.body.accessToken}`, id: res.body.user.id };
    };
    owner = (await register(ownerEmail, 'Chee')).auth;
    const benAccount = await register(benEmail, 'Ben');
    ben = benAccount.auth;

    // The brief's bill
    bill = (
      await post('/api/bills')
        .send({
          title: 'Friday dinner',
          merchant: 'Maxwell Food Centre',
          date: '2026-11-21',
        })
        .expect(201)
    ).body;
    for (const [name, unitPriceCents, quantity] of [
      ['Chicken Rice', 600, 1],
      ['Laksa', 750, 1],
      ['Tiger', 800, 2],
    ] as const) {
      const item = await post(`/api/bills/${bill.id}/items`)
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
      // Guests can't sign in yet, so Ben's account is linked here
      if (name === 'Ben') {
        await prisma.participant.update({
          where: { id: joined.body.participant.id },
          data: { userId: benAccount.id },
        });
      }
    }
    await post(`/api/bills/${bill.id}/claims`)
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
  });

  afterAll(async () => {
    await prisma.bill.deleteMany({ where: { owner: { email: ownerEmail } } });
    await prisma.expense.deleteMany({
      where: { user: { email: { in: [ownerEmail, benEmail] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, benEmail] } },
    });
    await app.close();
    vi.restoreAllMocks();
  });

  it('nothing is logged while the bill is open', async () => {
    expect(await shares(owner)).toEqual([]);
  });

  it('locking logs $7.20 for Chee and $9.59 for Ben, as Food & Drinks; guests without an account get nothing', async () => {
    await post(`/api/bills/${bill.id}/lock`).expect(200);

    expect(await shares(owner)).toEqual([
      expect.objectContaining({
        amountCents: 720,
        category: 'FOOD_DRINKS',
        merchant: 'Maxwell Food Centre',
        source: 'BILL_SHARE',
      }),
    ]);
    expect((await shares(ben)).map((e) => e.amountCents)).toEqual([959]);
    expect(await prisma.expense.count({ where: { billId: bill.id } })).toBe(2);
  });

  it('unlock, change claims, lock again: amounts update, still one row each, own category kept', async () => {
    const [chee] = await shares(owner);
    await request(server())
      .patch(`/api/expenses/${chee.id}`)
      .set('Authorization', owner)
      .send({ category: 'ENTERTAINMENT' })
      .expect(200);

    await post(`/api/bills/${bill.id}/unlock`).expect(200);
    // Ali drops the laksa, so it goes to Chee; Ben drops the beer, so he owes nothing
    for (const [name, item] of [
      ['Ali', 'Laksa'],
      ['Ben', 'Tiger'],
    ]) {
      await request(server())
        .delete(`/api/share/${bill.shareToken}/claims/${items[item]}`)
        .set('X-Guest-Token', guests[name])
        .expect(204);
    }
    const summary = await request(server())
      .get(`/api/bills/${bill.id}/summary`)
      .set('Authorization', owner)
      .expect(200);
    const cheeNow = summary.body.people.find(
      (p: { isOwner: boolean }) => p.isOwner,
    ).totalCents;
    await post(`/api/bills/${bill.id}/lock`).expect(200);

    const after = await shares(owner);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: chee.id,
      amountCents: cheeNow,
      category: 'ENTERTAINMENT',
    });
    expect(cheeNow).toBeGreaterThan(720);
    // Ben owes nothing now, so his row is gone
    expect(await shares(ben)).toEqual([]);
  });
});
