import { Logger } from '@nestjs/common';
import type { Email, EmailService } from './email.interface.js';

// Sends nothing: keeps each email in memory, so tests can read the link,
// and logs it, so it can be clicked when running the app locally
export class FakeEmailService implements EmailService {
  readonly provider = 'fake';
  readonly sent: Email[] = [];
  private readonly logger = new Logger('Email');

  send(email: Email): Promise<void> {
    this.sent.push(email);
    this.logger.log(`(fake) to ${email.to}: ${email.text}`);
    return Promise.resolve();
  }
}
