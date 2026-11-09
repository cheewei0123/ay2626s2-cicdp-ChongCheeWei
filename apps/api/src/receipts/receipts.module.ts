import { Module } from '@nestjs/common';
import { OcrModule } from '../ocr/ocr.module.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsService } from './receipts.service.js';

// Imports OcrModule to get the OCR_SERVICE token; PrismaService is global
@Module({
  imports: [OcrModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
