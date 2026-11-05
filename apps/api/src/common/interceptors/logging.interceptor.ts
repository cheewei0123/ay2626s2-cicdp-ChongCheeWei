import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { requestLog } from '../request-log.js';

// Wraps every controller call and logs it once it succeeds.
// Errors are logged by AllExceptionsFilter instead, because it decides the final status code.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next
      .handle()
      .pipe(tap(() => this.logger.log(requestLog(req, res, res.statusCode))));
  }
}
