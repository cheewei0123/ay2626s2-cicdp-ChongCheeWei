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
const ownerEmail = `e2e-receipts-owner-${run}@example.com`;
const otherEmail = `e2e-receipts-other-${run}@example.com`;

// A real 1x1 PNG, so the upload passes the image-type check
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Receipt upload (e2e, real database, Fake OCR)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: string;
  let other: string;

  async function registerToken(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'correct horse', displayName: 'Tester' })
      .expect(201);
    return `Bearer ${res.body.accessToken}`;
  }

  async function newBill() {
    const res = await request(app.getHttpServer())
      .post('/api/bills')
      .set('Authorization', owner)
      .send({ title: 'Dinner', merchant: 'Maxwell' })
      .expect(201);
    return res.body.id as string;
  }

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    // Always the Fake here, even if a developer's .env says gemini:
    // tests must never use the real AI or its free quota
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
    owner = await registerToken(ownerEmail);
    other = await registerToken(otherEmail);
  });

  afterAll(async () => {
    await prisma.bill.deleteMany({ where: { owner: { email: ownerEmail } } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });
    await app.close();
    vi.restoreAllMocks();
  });

  // The route allows 5 uploads a minute (Gemini's free limit), so this file
  // makes exactly 5, then checks that the 6th is refused.
  it('owner uploads a photo → gets a draft; the bill is not changed', async () => {
    const server = app.getHttpServer();
    const billId = await newBill();

    const res = await request(server)
      .post(`/api/bills/${billId}/receipt`)
      .set('Authorization', owner)
      .attach('image', png, 'receipt.png')
      .expect(201);

    expect(res.body.items).toHaveLength(3);
    expect(res.body.receipt).toMatchObject({
      merchant: 'Maxwell Food Centre',
      totalCents: 3537,
      category: 'FOOD_DRINKS',
    });
    expect(res.body).toMatchObject({ serviceBp: 1000, gstBp: 900 });
    expect(res.body.check).toMatchObject({
      subtotalMatches: true,
      totalMatches: true,
    });

    // Nothing saved on the bill until the owner checks and posts the items
    const bill = await request(server)
      .get(`/api/bills/${billId}`)
      .set('Authorization', owner)
      .expect(200);
    expect(bill.body.items).toEqual([]);

    const saved = await prisma.receiptImage.findFirstOrThrow({
      where: { billId },
    });
    expect(saved).toMatchObject({ ocrProvider: 'fake', storagePath: null });
  });

  it('refuses a file that is not a JPEG or PNG', async () => {
    const billId = await newBill();
    await request(app.getHttpServer())
      .post(`/api/bills/${billId}/receipt`)
      .set('Authorization', owner)
      .attach('image', Buffer.from('hello'), 'notes.txt')
      .expect(400);
  });

  it('refuses a photo over 5 MB', async () => {
    const billId = await newBill();
    await request(app.getHttpServer())
      .post(`/api/bills/${billId}/receipt`)
      .set('Authorization', owner)
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.png')
      .expect(413);
  });

  it("refuses someone else's bill", async () => {
    const billId = await newBill();
    await request(app.getHttpServer())
      .post(`/api/bills/${billId}/receipt`)
      .set('Authorization', other)
      .attach('image', png, 'receipt.png')
      .expect(403);
  });

  it('refuses a locked bill', async () => {
    const server = app.getHttpServer();
    const billId = await newBill();
    await request(server)
      .post(`/api/bills/${billId}/lock`)
      .set('Authorization', owner)
      .expect(200);
    await request(server)
      .post(`/api/bills/${billId}/receipt`)
      .set('Authorization', owner)
      .attach('image', png, 'receipt.png')
      .expect(409);
  });

  it('refuses the 6th upload in a minute (429), matching the free AI limit', async () => {
    const billId = await newBill();
    await request(app.getHttpServer())
      .post(`/api/bills/${billId}/receipt`)
      .set('Authorization', owner)
      .attach('image', png, 'receipt.png')
      .expect(429);
  });
});
