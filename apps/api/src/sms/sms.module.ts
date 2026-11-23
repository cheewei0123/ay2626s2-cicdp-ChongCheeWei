import { Module } from '@nestjs/common';
import { createSmsService } from './sms.factory.js';
import { SMS_SERVICE } from './sms.interface.js';

// Registers "whatever SMS_PROVIDER says" under the SMS_SERVICE token (KAN-91)
@Module({
  providers: [
    { provide: SMS_SERVICE, useFactory: () => createSmsService(process.env) },
  ],
  exports: [SMS_SERVICE],
})
export class SmsModule {}
