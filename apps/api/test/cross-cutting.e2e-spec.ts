import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

const UUID = /^[0-9a-f-]{36}$/;

describe('Cross-cutting (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('gives every response an x-request-id and logs the same ID', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const res = await request(app.getHttpServer()).get('/api').expect(200);

    expect(res.headers['x-request-id']).toMatch(UUID);
    const line = JSON.parse(log.mock.calls.at(-1)![0] as string);
    expect(line).toMatchObject({
      requestId: res.headers['x-request-id'],
      status: 200,
    });
  });

  it('sends back the request ID the client chose', async () => {
    const res = await request(app.getHttpServer())
      .get('/api')
      .set('x-request-id', 'my-id-1');
    expect(res.headers['x-request-id']).toBe('my-id-1');
  });

  it('returns the standard error JSON for an unknown route', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const res = await request(app.getHttpServer()).get('/api/nope').expect(404);

    expect(res.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /api/nope',
      requestId: res.headers['x-request-id'],
      timestamp: expect.any(String),
    });
  });

  it('adds safe headers (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/api');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS only from the web app', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api')
      .set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );

    // The header always names our web app, so a browser on another site sees no match and blocks it
    const other = await request(app.getHttpServer())
      .get('/api')
      .set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).not.toBe(
      'https://evil.example',
    );
  });

  it('answers 429 after 100 requests in a minute', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const server = app.getHttpServer();
    for (let i = 0; i < 100; i++) await request(server).get('/api').expect(200);

    const res = await request(server).get('/api').expect(429);
    expect(res.body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});
