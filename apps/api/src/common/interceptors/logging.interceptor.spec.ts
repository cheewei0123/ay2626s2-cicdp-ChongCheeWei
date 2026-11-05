import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor.js';

describe('LoggingInterceptor', () => {
  it('logs one JSON line per successful request and passes the response through', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const req = {
      method: 'GET',
      originalUrl: '/api',
      headers: { 'x-request-id': 'req-1' },
    };
    const res = { statusCode: 200, locals: { startedAt: Date.now() - 5 } };
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('Hello World!') };

    const result = await lastValueFrom(
      new LoggingInterceptor().intercept(context, next),
    );

    expect(result).toBe('Hello World!');
    expect(log).toHaveBeenCalledOnce();
    const line = JSON.parse(log.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      requestId: 'req-1',
      method: 'GET',
      path: '/api',
      status: 200,
    });
    expect(line.ms).toBeGreaterThanOrEqual(0);
    log.mockRestore();
  });
});
