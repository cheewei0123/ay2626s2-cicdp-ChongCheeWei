import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AccountDeletionService } from './../src/auth/account-deletion.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { markVerified } from './verified.js';

const stamp = Date.now();
const email = `e2e-delete-${stamp}@example.com`;
const friendEmail = `e2e-delete-friend-${stamp}@example.com`;
const password = 'correct horse';

// Deleting an account, against the real database (KAN-93): every way back in is
// closed at once, and the purge 6 months later wipes it but keeps friends' records.
describe('Account deletion (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;
  let bill: { id: string; shareToken: string; joinCode: string };
  let friendId: string;
  const server = () => app.getHttpServer();
  const register = (address: string) =>
    request(server())
      .post('/api/auth/register')
      .send({ email: address, password, displayName: 'Pat' });

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    token = `Bearer ${(await register(email).expect(201)).body.accessToken}`;
    friendId = (await register(friendEmail).expect(201)).body.user.id;
    await markVerified(app, email, friendEmail);
    bill = (
      await request(server())
        .post('/api/bills')
        .set('Authorization', token)
        .send({ title: 'Dinner at Maxwell' })
        .expect(201)
    ).body;
    // The owner's own spending, and the friend's share of the owner's bill
    await request(server())
      .post('/api/expenses')
      .set('Authorization', token)
      .send({
        amountCents: 450,
        category: 'FOOD_DRINKS',
        spentAt: '2026-11-20',
      })
      .expect(201);
    await prisma.expense.create({
      data: {
        userId: friendId,
        billId: bill.id,
        amountCents: 1200,
        category: 'FOOD_DRINKS',
        merchant: 'Dinner at Maxwell',
        spentAt: new Date('2026-11-20'),
        source: 'BILL_SHARE',
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [email, friendEmail] } },
    });
    await app.close();
    vi.restoreAllMocks();
  });

  it('needs the right password; a wrong one is 403 and keeps you logged in', async () => {
    await request(server())
      .delete('/api/me')
      .set('Authorization', token)
      .send({ password: 'wrong password' })
      .expect(403);
    await request(server())
      .delete('/api/me')
      .set('Authorization', token)
      .expect(400);
    await request(server())
      .get('/api/me')
      .set('Authorization', token)
      .expect(200);
  });

  it('deletes: logged out everywhere, no login, email still taken, links stop working', async () => {
    await request(server())
      .delete('/api/me')
      .set('Authorization', token)
      .send({ password })
      .expect(204);

    await request(server())
      .get('/api/me')
      .set('Authorization', token)
      .expect(401);
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(401);
    expect(login.body.message).toBe('Invalid email or password');
    await register(email).expect(409);
    await request(server()).get(`/api/share/${bill.shareToken}`).expect(404);
    await request(server()).get(`/api/join/${bill.joinCode}`).expect(404);

    // Forgot password still answers 204, but no reset link is made
    await request(server())
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(204);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.deletedAt).not.toBeNull();
    expect(
      await prisma.passwordResetToken.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    // Kept for now: the data is only wiped after 6 months
    expect(await prisma.bill.count({ where: { id: bill.id } })).toBe(1);
  });

  it('the purge wipes it after 6 months, and keeps what the friend spent', async () => {
    const deletion = app.get(AccountDeletionService);
    // Not yet: deleted just now
    await deletion.purge();
    expect(await prisma.user.count({ where: { email } })).toBe(1);

    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
    await prisma.user.update({
      where: { email },
      data: { deletedAt: sevenMonthsAgo },
    });
    expect(await deletion.purge()).toBeGreaterThanOrEqual(1);

    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(await prisma.bill.count({ where: { id: bill.id } })).toBe(0);
    const left = await prisma.expense.findMany({
      where: { userId: friendId },
    });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ amountCents: 1200, billId: null });
  });
});
