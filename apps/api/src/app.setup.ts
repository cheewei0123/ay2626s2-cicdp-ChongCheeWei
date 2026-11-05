import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

// App-wide settings, shared by main.ts and the e2e tests so both run the same app
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api'); // every route starts with /api
  app.use(helmet()); // safe HTTP headers, e.g. X-Content-Type-Options: nosniff
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }); // only our web app
  app.set('trust proxy', 1); // behind Caddy: rate limit by the real client IP
  // Checks every request body against its DTO: unknown fields and bad values get a 400
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
}
