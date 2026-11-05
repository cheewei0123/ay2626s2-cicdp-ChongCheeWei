import type { Request, Response } from 'express';
import { REQUEST_ID_HEADER } from './middleware/request-id.middleware.js';

// One log line per request, as JSON so logs can be searched by any field
export function requestLog(
  req: Request,
  res: Response,
  status: number,
): string {
  const startedAt = res.locals?.startedAt as number | undefined;
  return JSON.stringify({
    requestId: req.headers[REQUEST_ID_HEADER],
    method: req.method,
    path: req.originalUrl,
    status,
    ms: startedAt === undefined ? undefined : Date.now() - startedAt,
  });
}
