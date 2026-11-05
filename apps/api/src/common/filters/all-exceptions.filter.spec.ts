import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter, toHttpError } from './all-exceptions.filter.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
  });

describe('toHttpError', () => {
  it('keeps the status and message of an HttpException', () => {
    expect(toHttpError(new NotFoundException('Bill not found'))).toEqual({
      statusCode: 404,
      message: 'Bill not found',
    });
  });

  it('keeps the list of validation messages', () => {
    const err = new BadRequestException([
      'title must be a string',
      'gstBp must be an integer',
    ]);
    expect(toHttpError(err)).toEqual({
      statusCode: 400,
      message: ['title must be a string', 'gstBp must be an integer'],
    });
  });

  it('uses the status of a custom HttpException such as 429', () => {
    expect(
      toHttpError(new HttpException('Too Many Requests', 429)).statusCode,
    ).toBe(429);
  });

  it('turns a Prisma unique-constraint error (P2002) into 409', () => {
    expect(toHttpError(prismaError('P2002'))).toEqual({
      statusCode: 409,
      message: 'Already exists',
    });
  });

  it('turns a Prisma record-not-found error (P2025) into 404', () => {
    expect(toHttpError(prismaError('P2025'))).toEqual({
      statusCode: 404,
      message: 'Not found',
    });
  });

  it.each([
    ['another Prisma error', prismaError('P1001')],
    ['a plain Error', new Error('secret connection string in here')],
    ['a thrown string', 'oops'],
  ])('hides the details of %s behind a 500', (_case, err) => {
    expect(toHttpError(err)).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});

describe('AllExceptionsFilter', () => {
  // A fake request/response pair; json() records what would be sent
  function fakeHost() {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })), locals: {} };
    const req = {
      method: 'GET',
      originalUrl: '/api/x',
      headers: { 'x-request-id': 'req-1' },
    };
    const host = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ArgumentsHost;
    return { host, json };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('logs a 500 with its stack trace outside production', () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { host, json } = fakeHost();
    vi.stubEnv('NODE_ENV', 'development');

    new AllExceptionsFilter().catch(new Error('boom'), host);

    expect(json.mock.calls[0][0]).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(error.mock.calls[0][1]).toContain('Error: boom');
  });

  it('leaves the stack trace out of the log in production', () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { host } = fakeHost();
    vi.stubEnv('NODE_ENV', 'production');

    new AllExceptionsFilter().catch(new Error('boom'), host);

    expect(error.mock.calls[0][1]).toBeUndefined();
  });

  it('never sends a stack trace to the client', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, json } = fakeHost();

    new AllExceptionsFilter().catch(new Error('boom'), host);

    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('boom');
  });

  it('sends the standard error JSON with the request ID', () => {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })), locals: {} };
    const req = {
      method: 'GET',
      originalUrl: '/api/bills/x',
      headers: { 'x-request-id': 'req-1' },
    };
    const host = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(
      new NotFoundException('Bill not found'),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'Bill not found',
      requestId: 'req-1',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });
});
