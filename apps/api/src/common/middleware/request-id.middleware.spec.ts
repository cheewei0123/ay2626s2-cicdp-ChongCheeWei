import type { NextFunction, Request, Response } from 'express';
import {
  REQUEST_ID_HEADER,
  RequestIdMiddleware,
} from './request-id.middleware.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Fake Express request/response with only the parts the middleware uses
function run(incoming?: string) {
  const req = {
    headers: incoming ? { [REQUEST_ID_HEADER]: incoming } : {},
  } as Request;
  const headers: Record<string, string> = {};
  const res = {
    locals: {},
    setHeader: (name: string, value: string) => (headers[name] = value),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  new RequestIdMiddleware().use(req, res, next);
  return { req, res, headers, next };
}

describe('RequestIdMiddleware', () => {
  it('creates a UUID when the client sends none', () => {
    const { req, headers, next } = run();
    expect(headers[REQUEST_ID_HEADER]).toMatch(UUID);
    expect(req.headers[REQUEST_ID_HEADER]).toBe(headers[REQUEST_ID_HEADER]);
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps a safe ID sent by the client', () => {
    expect(run('abc-123').headers[REQUEST_ID_HEADER]).toBe('abc-123');
  });

  it.each([
    ['a line break (log injection)', 'abc\nfake log line'],
    ['more than 64 characters', 'a'.repeat(65)],
    ['spaces', 'abc 123'],
  ])('replaces a client ID with %s', (_case, bad) => {
    expect(run(bad).headers[REQUEST_ID_HEADER]).toMatch(UUID);
  });

  it('records when the request started, for the response time', () => {
    const before = Date.now();
    const { res } = run();
    expect(res.locals.startedAt).toBeGreaterThanOrEqual(before);
  });
});
