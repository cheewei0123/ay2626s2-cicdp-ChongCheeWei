import { Module } from '@nestjs/common';
import { createOcrService } from './ocr.factory.js';
import { OCR_SERVICE } from './ocr.interface.js';

// Registers "whatever OCR_PROVIDER says" under the OCR_SERVICE token.
// Other modules import OcrModule and inject OCR_SERVICE; they never name a class.
@Module({
  providers: [
    {
      provide: OCR_SERVICE,
      // Runs once when the app starts, so a wrong setting stops the app straight away
      useFactory: () => createOcrService(process.env.OCR_PROVIDER),
    },
  ],
  exports: [OCR_SERVICE],
})
export class OcrModule {}
