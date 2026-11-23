import { Logger } from '@nestjs/common';
import type { Sms, SmsService } from './sms.interface.js';

// Sends nothing: keeps each message in memory, so tests can read the code,
// and logs it, so the code can be typed in when running the app locally
export class FakeSmsService implements SmsService {
  readonly provider = 'fake';
  readonly sent: Sms[] = [];
  private readonly logger = new Logger('Sms');

  send(sms: Sms): Promise<void> {
    this.sent.push(sms);
    this.logger.log(`(fake) to ${sms.to}: ${sms.text}`);
    return Promise.resolve();
  }
}
