import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// Only trust a client's ID if it is short and has no characters that could fake a log line
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

// Runs first on every request: gives it an ID that is sent back and written in every log line
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id =
      typeof incoming === 'string' && SAFE_ID.test(incoming)
        ? incoming
        : randomUUID();

    req.headers[REQUEST_ID_HEADER] = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    res.locals.startedAt = Date.now();
    next();
  }
}
