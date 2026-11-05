import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client.js';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware.js';
import { requestLog } from '../request-log.js';

type HttpError = { statusCode: number; message: string | string[] };

// Turns anything that was thrown into a status code and a message that is safe to show
export function toHttpError(exception: unknown): HttpError {
  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body.message as string | string[])
        : exception.message;
    return { statusCode: exception.getStatus(), message };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002')
      return { statusCode: 409, message: 'Already exists' };
    if (exception.code === 'P2025')
      return { statusCode: 404, message: 'Not found' };
  }
  // Anything else is a bug: never send its details (they may contain secrets)
  return { statusCode: 500, message: 'Internal server error' };
}

// Catches every error so all of them reach the client in one format
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { statusCode, message } = toHttpError(exception);

    if (statusCode >= 500) {
      // The stack trace goes to the server log only, and not in production
      const stack =
        process.env.NODE_ENV === 'production'
          ? undefined
          : (exception as Error)?.stack;
      this.logger.error(requestLog(req, res, statusCode), stack);
    } else {
      this.logger.warn(requestLog(req, res, statusCode));
    }

    res.status(statusCode).json({
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      requestId: req.headers[REQUEST_ID_HEADER],
      timestamp: new Date().toISOString(),
    });
  }
}
