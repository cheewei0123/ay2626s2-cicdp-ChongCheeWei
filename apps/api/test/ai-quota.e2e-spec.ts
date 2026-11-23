import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { FakeOcrService } from './../src/ocr/fake-ocr.service.js';
import { OCR_SERVICE } from './../src/ocr/ocr.interface.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { markVerified } from './verified.js';

const email = `e2e-ai-quota-${Date.now()}@example.com`;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// Its own app, so the per-IP limit (5 a minute) from other files doesn't interfere
describe('Daily AI scan cap per account (e2e, KAN-88)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;

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
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'correct horse', displayName: 'Quota' })
      .expect(201);
    token = `Bearer ${res.body.accessToken}`;
    await markVerified(app, email);
    process.env.AI_DAILY_LIMIT = '2';
  });

  afterAll(async () => {
    delete process.env.AI_DAILY_LIMIT;
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
    vi.restoreAllMocks();
  });

  const scan = () =>
    request(app.getHttpServer())
      .post('/api/expenses/receipt')
      .set('Authorization', token)
      .attach('image', png, 'receipt.png');

  it('allows the daily number of scans, then refuses with a clear 429', async () => {
    await scan().expect(201);
    await scan().expect(201);
    const res = await scan().expect(429);
    expect(res.body.message).toContain('all 2 receipt scans for today');

    const [row] = await prisma.aiScanCount.findMany({
      where: { user: { email } },
    });
    expect(row.count).toBe(3);
  });
});
