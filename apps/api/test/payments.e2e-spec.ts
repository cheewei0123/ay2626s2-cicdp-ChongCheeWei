import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { markVerified } from './verified.js';

const stamp = Date.now();
const ownerEmail = `e2e-payments-${stamp}@example.com`;
const otherEmail = `e2e-payments-other-${stamp}@example.com`;

type Person = { participantId: string; displayName: string; paid: boolean };

describe('Marking payments (e2e, real database)', () => {
  let app: NestExpressApplication;
  let owner: string;
  let other: string;
  let bill: { id: string; shareToken: string };
  const people: Record<string, string> = {}; // name → participantId
  let aliGuestToken: string;

  const server = () => app.getHttpServer();
  const mark = (name: string, paid: boolean, auth = owner) =>
    request(server())
      .patch(`/api/bills/${bill.id}/payments/${people[name]}`)
      .set('Authorization', auth)
      .send({ paid });
  const status = async () =>
    (
      await request(server())
        .get(`/api/bills/${bill.id}`)
        .set('Authorization', owner)
        .expect(200)
    ).body.status;

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

    const register = async (email: string, displayName: string) =>
      `Bearer ${
        (
          await request(server())
            .post('/api/auth/register')
            .send({ email, password: 'correct horse', displayName })
            .expect(201)
        ).body.accessToken
      }`;
    owner = await register(ownerEmail, 'Chee');
    other = await register(otherEmail, 'Mallory');
    await markVerified(app, ownerEmail, otherEmail);

    bill = (
      await request(server())
        .post('/api/bills')
        .set('Authorization', owner)
        .send({ title: 'Maxwell' })
        .expect(201)
    ).body;
    const laksa = await request(server())
      .post(`/api/bills/${bill.id}/items`)
      .set('Authorization', owner)
      .send({ name: 'Laksa', unitPriceCents: 750, quantity: 1 })
      .expect(201);
    const tiger = await request(server())
      .post(`/api/bills/${bill.id}/items`)
      .set('Authorization', owner)
      .send({ name: 'Tiger', unitPriceCents: 800, quantity: 1 })
      .expect(201);

    // Ali had the laksa, Ben the beer
    for (const [name, itemId] of [
      ['Ali', laksa.body.id],
      ['Ben', tiger.body.id],
    ]) {
      const joined = await request(server())
        .post(`/api/share/${bill.shareToken}/participants`)
        .send({ displayName: name })
        .expect(201);
      people[name] = joined.body.participant.id;
      if (name === 'Ali') aliGuestToken = joined.body.guestToken;
      await request(server())
        .post(`/api/share/${bill.shareToken}/claims`)
        .set('X-Guest-Token', joined.body.guestToken)
        .send({ itemId })
        .expect(201);
    }
    const summary = await request(server())
      .get(`/api/bills/${bill.id}/summary`)
      .set('Authorization', owner)
      .expect(200);
    people.Chee = summary.body.people.find(
      (p: Person) => p.displayName === 'Chee',
    ).participantId;
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.bill.deleteMany({ where: { owner: { email: ownerEmail } } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });
    await app.close();
    vi.restoreAllMocks();
  });

  it('answers 409 while the bill is still open', async () => {
    const res = await mark('Ali', true).expect(409);
    expect(res.body.message).toBe('Lock the bill before marking payments');
  });

  it('only the owner can mark payments', async () => {
    await request(server())
      .post(`/api/bills/${bill.id}/lock`)
      .set('Authorization', owner)
      .expect(200);

    await request(server())
      .patch(`/api/bills/${bill.id}/payments/${people.Ali}`)
      .send({ paid: true })
      .expect(401);
    await request(server())
      .patch(`/api/bills/${bill.id}/payments/${people.Ali}`)
      .set('X-Guest-Token', aliGuestToken)
      .send({ paid: true })
      .expect(401);
    await mark('Ali', true, other).expect(403);
  });

  it('checks the body and the person', async () => {
    await mark('Ali', 'yes' as unknown as boolean).expect(400);
    await mark('Chee', true).expect(400);
    await request(server())
      .patch(`/api/bills/${bill.id}/payments/nobody`)
      .set('Authorization', owner)
      .send({ paid: true })
      .expect(404);
  });

  it('marks people as paid, settles the bill, and the summaries show it', async () => {
    // Laksa 750 + 10% service 75 + 9% GST 74 = 899
    const ali = await mark('Ali', true).expect(200);
    expect(ali.body).toMatchObject({
      paid: true,
      amountCents: 899,
      paidCount: 1,
      owingCount: 2,
      status: 'LOCKED',
    });

    // Someone is marked as paid, so the bill can't be reopened
    await request(server())
      .post(`/api/bills/${bill.id}/unlock`)
      .set('Authorization', owner)
      .expect(409);

    const ben = await mark('Ben', true).expect(200);
    expect(ben.body).toMatchObject({ paidCount: 2, status: 'SETTLED' });
    expect(await status()).toBe('SETTLED');

    // A guest sees they've been marked as paid
    const shared = await request(server())
      .get(`/api/share/${bill.shareToken}/summary`)
      .expect(200);
    expect(
      shared.body.people.find((p: Person) => p.displayName === 'Ali').paid,
    ).toBe(true);
  });

  it('unticking someone takes a settled bill back to locked', async () => {
    const res = await mark('Ben', false).expect(200);
    expect(res.body).toMatchObject({ paid: false, status: 'LOCKED' });
    expect(await status()).toBe('LOCKED');
  });
});
