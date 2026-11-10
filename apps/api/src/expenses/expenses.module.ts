import { Module } from '@nestjs/common';
import { OcrModule } from '../ocr/ocr.module.js';
import { ExpensesController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';

// Imports OcrModule for scanning personal receipts; PrismaService is global.
// Nothing from BillsModule: bill shares will arrive through an event (KAN-79).
@Module({
  imports: [OcrModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
