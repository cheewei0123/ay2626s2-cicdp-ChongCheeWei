import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { SplitService } from './../src/split/split.service.js';

const run = Date.now();
const ownerEmail = `e2e-claims-${run}@example.com`;

describe('Claims and lock (e2e, real database)', () => {
  let app: NestExpressApplication;
  let owner: string;
  let bill: { id: string; shareToken: string };
  let tiger: { id: string };
  let otherBillItem: { id: string };
  let ben: string;
  let dan: string;

  const server = () => app.getHttpServer();
  const claims = () => `/api/share/${bill.shareToken}/claims`;

  async function newBill(title: string) {
    const res = await request(server())
      .post('/api/bills')
      .set('Authorization', owner)
      .send({ title })
      .expect(201);
    return res.body;
  }

  async function addItem(
    billId: string,
    name: string,
    unitPriceCents: number,
    quantity = 1,
  ) {
    const res = await request(server())
      .post(`/api/bills/${billId}/items`)
      .set('Authorization', owner)
      .send({ name, unitPriceCents, quantity })
      .expect(201);
    return res.body;
  }

  async function joinAs(displayName: string) {
    const res = await request(server())
      .post(`/api/share/${bill.shareToken}/participants`)
      .send({ displayName })
      .expect(201);
    return res.body.guestToken as string;
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

    const res = await request(server())
      .post('/api/auth/register')
      .send({
        email: ownerEmail,
        password: 'correct horse',
        displayName: 'Chee',
      })
      .expect(201);
    owner = `Bearer ${res.body.accessToken}`;

    bill = await newBill('Dinner at Maxwell');
    tiger = await addItem(bill.id, 'Tiger', 800, 2);
    otherBillItem = await addItem(
      (await newBill('Another bill')).id,
      'Kopi',
      150,
    );
    ben = await joinAs('Ben');
    dan = await joinAs('Dan');
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.bill.deleteMany({ where: { owner: { email: ownerEmail } } });
    await prisma.user.deleteMany({ where: { email: ownerEmail } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('two guests claim the same item and it splits 50/50', async () => {
    await request(server())
      .post(claims())
      .set('X-Guest-Token', ben)
      .send({ itemId: tiger.id })
      .expect(201);
    await request(server())
      .post(claims())
      .set('X-Guest-Token', dan)
      .send({ itemId: tiger.id })
      .expect(201);

    // Feed the real claims from the database into the KAN-20 split engine
    const view = await request(server())
      .get(`/api/share/${bill.shareToken}`)
      .expect(200);
    const item = view.body.items[0];
    expect(item.claims).toHaveLength(2);
    const result = new SplitService().split({
      items: [
        {
          id: item.id,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
        },
      ],
      claims: item.claims.map(
        (c: { participantId: string; shares: number }) => ({
          itemId: item.id,
          participantId: c.participantId,
          shares: c.shares,
        }),
      ),
      serviceBp: view.body.serviceBp,
      gstBp: view.body.gstBp,
      ownerParticipantId: view.body.participants[0].id,
    });
    // $16.00 + 10% + 9% = 1918; split 50/50 = 959 each (the brief's Ben and Dan)
    expect(result.people.map((p) => p.totalCents)).toEqual([959, 959]);
    expect(result.people.map((p) => p.itemsCents)).toEqual([800, 800]);
  });

  it('claiming twice does not create a duplicate', async () => {
    await request(server())
      .post(claims())
      .set('X-Guest-Token', ben)
      .send({ itemId: tiger.id })
      .expect(201);
    const count = await app
      .get(PrismaService)
      .claim.count({ where: { itemId: tiger.id } });
    expect(count).toBe(2);
  });

  it('answers 404 when claiming an item from another bill', async () => {
    await request(server())
      .post(claims())
      .set('X-Guest-Token', ben)
      .send({ itemId: otherBillItem.id })
      .expect(404);
  });

  it('needs a guest token from this bill', async () => {
    await request(server())
      .post(claims())
      .send({ itemId: tiger.id })
      .expect(401);
    // A login token is not a guest token
    await request(server())
      .post(claims())
      .set('X-Guest-Token', owner.slice(7))
      .send({ itemId: tiger.id })
      .expect(401);
  });

  it('lets a guest unclaim, and only their own claim', async () => {
    await request(server())
      .delete(`${claims()}/${tiger.id}`)
      .set('X-Guest-Token', dan)
      .expect(204);
    await request(server())
      .delete(`${claims()}/${tiger.id}`)
      .set('X-Guest-Token', dan)
      .expect(404);
    const left = await app
      .get(PrismaService)
      .claim.count({ where: { itemId: tiger.id } });
    expect(left).toBe(1);
  });

  it('owner locks the bill: claims answer 409, unlock reopens it', async () => {
    const lock = await request(server())
      .post(`/api/bills/${bill.id}/lock`)
      .set('Authorization', owner)
      .expect(200);
    expect(lock.body).toEqual({ id: bill.id, status: 'LOCKED' });

    const res = await request(server())
      .post(claims())
      .set('X-Guest-Token', dan)
      .send({ itemId: tiger.id })
      .expect(409);
    expect(res.body.message).toBe('Bill is locked; unlock it to make changes');
    await request(server())
      .post(`/api/bills/${bill.id}/lock`)
      .set('Authorization', owner)
      .expect(409);

    await request(server())
      .post(`/api/bills/${bill.id}/unlock`)
      .set('Authorization', owner)
      .expect(200);
    await request(server())
      .post(claims())
      .set('X-Guest-Token', dan)
      .send({ itemId: tiger.id })
      .expect(201);
  });

  it('only the owner can lock (a guest token is not a login)', async () => {
    await request(server())
      .post(`/api/bills/${bill.id}/lock`)
      .set('Authorization', `Bearer ${ben}`)
      .expect(401);
  });
});
