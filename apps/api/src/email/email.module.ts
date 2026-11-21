import { Module } from '@nestjs/common';
import { createEmailService } from './email.factory.js';
import { EMAIL_SERVICE } from './email.interface.js';

// Registers "whatever EMAIL_PROVIDER says" under the EMAIL_SERVICE token.
// AuthModule imports this and injects EMAIL_SERVICE; it never names a class.
@Module({
  providers: [
    {
      provide: EMAIL_SERVICE,
      useFactory: () => createEmailService(process.env),
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
