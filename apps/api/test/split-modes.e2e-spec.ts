import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { SplitService, type SplitMode } from './../src/split/split.service.js';

const ownerEmail = `e2e-modes-${Date.now()}@example.com`;

type ViewItem = {
  id: string;
  unitPriceCents: number;
  quantity: number;
  splitMode: SplitMode;
  claims: {
    participantId: string;
    shares: number;
    percentBp: number | null;
    exactCents: number | null;
  }[];
};

describe('Split modes (e2e, real database)', () => {
  let app: NestExpressApplication;
  let owner: string;
  let bill: { id: string; shareToken: string };
  let tigerId: string;
  const guests: Record<string, { token: string; id: string }> = {};

  const server = () => app.getHttpServer();
  const share = () => `/api/share/${bill.shareToken}`;
  const setSplit = (who: string, body: object) =>
    request(server())
      .patch(`${share()}/claims/${tigerId}`)
      .set('X-Guest-Token', guests[who].token)
      .send(body);
  const percent = (ben: number, dan: number) => ({
    splitMode: 'PERCENT',
    entries: [
      { participantId: guests.Ben.id, percentBp: ben },
      { participantId: guests.Dan.id, percentBp: dan },
    ],
  });

  // Runs the bill as stored in the database through the split engine
  async function splitFromDatabase() {
    const view = await request(server()).get(share()).expect(200);
    const items: ViewItem[] = view.body.items;
    return new SplitService().split({
      items: items.map((i) => ({
        id: i.id,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        splitMode: i.splitMode,
      })),
      claims: items.flatMap((i) =>
        i.claims.map((c) => ({ itemId: i.id, ...c })),
      ),
      serviceBp: view.body.serviceBp,
      gstBp: view.body.gstBp,
      ownerParticipantId: guests.Chee.id,
    });
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
    bill = (
      await request(server())
        .post('/api/bills')
        .set('Authorization', owner)
        .send({ title: 'Maxwell' })
        .expect(201)
    ).body;

    // The brief's bill, and who had what
    const itemIds: Record<string, string> = {};
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
      itemIds[name] = item.body.id;
    }
    tigerId = itemIds.Tiger;
    for (const name of ['Chee', 'Ali', 'Ben', 'Dan']) {
      const joined = await request(server())
        .post(`${share()}/participants`)
        .send({ displayName: name })
        .expect(201);
      guests[name] = {
        token: joined.body.guestToken,
        id: joined.body.participant.id,
      };
    }
    for (const [name, item] of [
      ['Chee', 'Chicken Rice'],
      ['Ali', 'Laksa'],
      ['Ben', 'Tiger'],
      ['Dan', 'Tiger'],
    ]) {
      await request(server())
        .post(`${share()}/claims`)
        .set('X-Guest-Token', guests[name].token)
        .send({ itemId: itemIds[item] })
        .expect(201);
    }
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.bill.deleteMany({ where: { owner: { email: ownerEmail } } });
    await prisma.user.deleteMany({ where: { email: ownerEmail } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('Ben 70% / Dan 30% of the Tiger → 1120 / 480, and the bill still totals 3537', async () => {
    const res = await setSplit('Ben', percent(7000, 3000)).expect(200);
    expect(res.body.portions).toEqual([
      { participantId: guests.Ben.id, cents: 1120 },
      { participantId: guests.Dan.id, cents: 480 },
    ]);

    const people = (await splitFromDatabase()).people;
    const itemsBy = Object.fromEntries(
      people.map((p) => [p.participantId, p.itemsCents]),
    );
    expect(itemsBy[guests.Ben.id]).toBe(1120);
    expect(itemsBy[guests.Dan.id]).toBe(480);
    expect(people.reduce((a, p) => a + p.totalCents, 0)).toBe(3537);
  });

  it('answers 400 when percentages add up to 90%', async () => {
    const res = await setSplit('Ben', percent(6000, 3000)).expect(400);
    expect(res.body.message).toContain('Percentages add up to 90%, need 100%');
  });

  it('answers 400 when exact amounts do not match the price', async () => {
    const res = await setSplit('Dan', {
      splitMode: 'EXACT',
      entries: [
        { participantId: guests.Ben.id, exactCents: 1000 },
        { participantId: guests.Dan.id, exactCents: 500 },
      ],
    }).expect(400);
    expect(res.body.message).toBe(
      'Exact amounts add up to $15.00, need $16.00',
    );
  });

  it('answers 403 for a guest who did not claim the item', async () => {
    await setSplit('Ali', percent(5000, 5000)).expect(403);
  });

  it('lets the owner change it too, e.g. SHARES 3:1', async () => {
    const res = await request(server())
      .patch(`/api/bills/${bill.id}/items/${tigerId}/split`)
      .set('Authorization', owner)
      .send({
        splitMode: 'SHARES',
        entries: [
          { participantId: guests.Ben.id, shares: 3 },
          { participantId: guests.Dan.id, shares: 1 },
        ],
      })
      .expect(200);
    expect(res.body.portions.map((p: { cents: number }) => p.cents)).toEqual([
      1200, 400,
    ]);
  });

  it('goes back to EQUAL when someone new claims a PERCENT item', async () => {
    await setSplit('Ben', percent(7000, 3000)).expect(200);
    await request(server())
      .post(`${share()}/claims`)
      .set('X-Guest-Token', guests.Ali.token)
      .send({ itemId: tigerId })
      .expect(201);

    const view = await request(server()).get(share()).expect(200);
    const tiger = view.body.items.find((i: ViewItem) => i.id === tigerId);
    expect(tiger.splitMode).toBe('EQUAL');
    expect(
      tiger.claims.every(
        (c: ViewItem['claims'][number]) => c.percentBp === null,
      ),
    ).toBe(true);
    expect(
      (await splitFromDatabase()).people.reduce((a, p) => a + p.totalCents, 0),
    ).toBe(3537);
  });
});
