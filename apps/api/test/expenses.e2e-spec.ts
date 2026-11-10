import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { FakeOcrService } from './../src/ocr/fake-ocr.service.js';
import { OCR_SERVICE } from './../src/ocr/ocr.interface.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const run = Date.now();
const aliceEmail = `e2e-expenses-a-${run}@example.com`;
const bobEmail = `e2e-expenses-b-${run}@example.com`;

// A real 1x1 PNG, so the upload passes the image-type check
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Expenses (e2e, real database)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let alice: string;
  let bob: string;
  let aliceId: string;

  const api = () => request(app.getHttpServer());

  async function register(email: string) {
    const res = await api()
      .post('/api/auth/register')
      .send({ email, password: 'correct horse', displayName: 'Tester' })
      .expect(201);
    return res.body as { accessToken: string; user: { id: string } };
  }

  async function add(token: string, body: object) {
    const res = await api()
      .post('/api/expenses')
      .set('Authorization', token)
      .send(body)
      .expect(201);
    return res.body as { id: string };
  }

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OCR_SERVICE)
      .useValue(new FakeOcrService())
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const a = await register(aliceEmail);
    alice = `Bearer ${a.accessToken}`;
    aliceId = a.user.id;
    bob = `Bearer ${(await register(bobEmail)).accessToken}`;

    // Alice's November 2026, plus one just after midnight on 1 Dec (Singapore)
    await add(alice, {
      amountCents: 720,
      category: 'FOOD_DRINKS',
      merchant: 'Maxwell',
      spentAt: '2026-11-03T12:30:00+08:00',
    });
    await add(alice, {
      amountCents: 3770,
      category: 'GROCERIES',
      merchant: 'NTUC',
      spentAt: '2026-11-10T18:00:00+08:00',
    });
    await add(alice, {
      amountCents: 1250,
      category: 'FOOD_DRINKS',
      spentAt: '2026-11-30T23:00:00+08:00',
    });
    await add(alice, {
      amountCents: 300,
      category: 'TRANSPORT',
      spentAt: '2026-12-01T00:30:00+08:00',
    });
  });

  afterAll(async () => {
    // Expenses first: deleting a user does not delete their expenses by itself
    const users = { email: { in: [aliceEmail, bobEmail] } };
    await prisma.expense.deleteMany({ where: { user: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
    vi.restoreAllMocks();
  });

  it('needs a login', async () => {
    await api().get('/api/expenses').expect(401);
  });

  it('adds a manual expense and returns it with the amount as text', async () => {
    const res = await api()
      .post('/api/expenses')
      .set('Authorization', alice)
      .send({
        amountCents: 450,
        category: 'OTHERS',
        note: '  parking  ',
        spentAt: '2026-10-15',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      amountCents: 450,
      amount: '$4.50',
      category: 'OTHERS',
      note: 'parking',
      source: 'MANUAL',
      billId: null,
    });
    expect(res.body).not.toHaveProperty('userId');
  });

  it('counts months in Singapore time: 11pm on 30 Nov is November, 00:30 on 1 Dec is not', async () => {
    const nov = await api()
      .get('/api/expenses?month=2026-11')
      .set('Authorization', alice)
      .expect(200);
    const dec = await api()
      .get('/api/expenses?month=2026-12')
      .set('Authorization', alice)
      .expect(200);

    // Newest first
    expect(
      nov.body.items.map((e: { amountCents: number }) => e.amountCents),
    ).toEqual([1250, 3770, 720]);
    expect(nov.body).toMatchObject({
      month: '2026-11',
      page: 1,
      pageSize: 50,
      totalCount: 3,
    });
    expect(
      dec.body.items.map((e: { amountCents: number }) => e.amountCents),
    ).toEqual([300]);
  });

  it('pages through the list without repeating or missing anything', async () => {
    const pages = [];
    for (const page of [1, 2]) {
      const res = await api()
        .get(`/api/expenses?month=2026-11&page=${page}&pageSize=2`)
        .set('Authorization', alice)
        .expect(200);
      pages.push(
        ...res.body.items.map((e: { amountCents: number }) => e.amountCents),
      );
    }
    expect(pages).toEqual([1250, 3770, 720]);
  });

  it('summary totals equal the sum of the listed expenses', async () => {
    const list = await api()
      .get('/api/expenses?month=2026-11')
      .set('Authorization', alice)
      .expect(200);
    const summary = await api()
      .get('/api/expenses/summary?month=2026-11')
      .set('Authorization', alice)
      .expect(200);

    const listed = list.body.items.reduce(
      (sum: number, e: { amountCents: number }) => sum + e.amountCents,
      0,
    );
    expect(summary.body.totalCents).toBe(listed);
    expect(summary.body).toEqual({
      month: '2026-11',
      totalCents: 5740,
      total: '$57.40',
      byCategory: [
        { category: 'GROCERIES', totalCents: 3770, total: '$37.70', count: 1 },
        {
          category: 'FOOD_DRINKS',
          totalCents: 1970,
          total: '$19.70',
          count: 2,
        },
      ],
    });
  });

  it.each([
    [
      'amount of 0',
      { amountCents: 0, category: 'OTHERS', spentAt: '2026-11-05' },
    ],
    [
      'dollars instead of cents',
      { amountCents: 12.5, category: 'OTHERS', spentAt: '2026-11-05' },
    ],
    [
      'unknown category',
      { amountCents: 100, category: 'FOOD', spentAt: '2026-11-05' },
    ],
    ['no date', { amountCents: 100, category: 'OTHERS' }],
    [
      'a bill share added by hand',
      {
        amountCents: 100,
        category: 'OTHERS',
        spentAt: '2026-11-05',
        source: 'BILL_SHARE',
      },
    ],
    [
      'someone else’s userId',
      {
        amountCents: 100,
        category: 'OTHERS',
        spentAt: '2026-11-05',
        userId: 'x',
      },
    ],
  ])('rejects %s (400)', async (_name, body) => {
    await api()
      .post('/api/expenses')
      .set('Authorization', alice)
      .send(body)
      .expect(400);
  });

  it.each(['2026-13', '2026-1', 'november'])(
    'rejects month=%s (400)',
    async (month) => {
      await api()
        .get(`/api/expenses?month=${month}`)
        .set('Authorization', alice)
        .expect(400);
      await api()
        .get(`/api/expenses/summary?month=${month}`)
        .set('Authorization', alice)
        .expect(400);
    },
  );

  it('user B can’t see, edit or delete user A’s expenses (404)', async () => {
    const secret = await add(alice, {
      amountCents: 999,
      category: 'GIFTS',
      spentAt: '2026-11-20',
    });

    const list = await api()
      .get('/api/expenses?month=2026-11')
      .set('Authorization', bob)
      .expect(200);
    expect(list.body.totalCount).toBe(0);
    const summary = await api()
      .get('/api/expenses/summary?month=2026-11')
      .set('Authorization', bob)
      .expect(200);
    expect(summary.body.totalCents).toBe(0);

    await api()
      .patch(`/api/expenses/${secret.id}`)
      .set('Authorization', bob)
      .send({ amountCents: 1 })
      .expect(404);
    await api()
      .delete(`/api/expenses/${secret.id}`)
      .set('Authorization', bob)
      .expect(404);

    // Unchanged for Alice
    const mine = await prisma.expense.findUniqueOrThrow({
      where: { id: secret.id },
    });
    expect(mine.amountCents).toBe(999);
  });

  it('edits and deletes my own expense', async () => {
    const coffee = await add(alice, {
      amountCents: 650,
      category: 'OTHERS',
      spentAt: '2026-11-21',
    });

    const res = await api()
      .patch(`/api/expenses/${coffee.id}`)
      .set('Authorization', alice)
      .send({ category: 'FOOD_DRINKS', amountCents: 680 })
      .expect(200);
    expect(res.body).toMatchObject({
      category: 'FOOD_DRINKS',
      amountCents: 680,
      amount: '$6.80',
    });

    await api()
      .delete(`/api/expenses/${coffee.id}`)
      .set('Authorization', alice)
      .expect(204);
    await api()
      .patch(`/api/expenses/${coffee.id}`)
      .set('Authorization', alice)
      .send({ note: 'x' })
      .expect(404);
  });

  it('a bill share can be recategorised, but not changed or deleted here (409)', async () => {
    // Made directly in the database, the way locking a bill will (KAN-79)
    const share = await prisma.expense.create({
      data: {
        userId: aliceId,
        amountCents: 720,
        category: 'FOOD_DRINKS',
        spentAt: new Date('2026-11-22'),
        source: 'BILL_SHARE',
      },
    });

    await api()
      .patch(`/api/expenses/${share.id}`)
      .set('Authorization', alice)
      .send({ amountCents: 1 })
      .expect(409);
    await api()
      .delete(`/api/expenses/${share.id}`)
      .set('Authorization', alice)
      .expect(409);
    const res = await api()
      .patch(`/api/expenses/${share.id}`)
      .set('Authorization', alice)
      .send({ category: 'GIFTS' })
      .expect(200);
    expect(res.body).toMatchObject({
      category: 'GIFTS',
      amountCents: 720,
      source: 'BILL_SHARE',
    });
  });

  it('scans a personal receipt into a draft without saving it', async () => {
    const before = await prisma.expense.count({ where: { userId: aliceId } });

    const res = await api()
      .post('/api/expenses/receipt')
      .set('Authorization', alice)
      .attach('image', png, {
        filename: 'receipt.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(res.body).toEqual({
      amountCents: 3537,
      amount: '$35.37',
      merchant: 'Maxwell Food Centre',
      category: 'FOOD_DRINKS',
      spentAt: '2026-11-01',
      source: 'RECEIPT',
    });
    expect(await prisma.expense.count({ where: { userId: aliceId } })).toBe(
      before,
    );
  });

  it('refuses a receipt that is not a photo (400)', async () => {
    await api()
      .post('/api/expenses/receipt')
      .set('Authorization', alice)
      .attach('image', Buffer.from('hello'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });
});
