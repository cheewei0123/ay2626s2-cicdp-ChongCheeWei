import { Module } from '@nestjs/common';
import { OcrModule } from '../ocr/ocr.module.js';
import { BillShareListener } from './bill-share.listener.js';
import { ExpensesController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';

// Imports OcrModule for scanning personal receipts; PrismaService is global.
// Nothing from BillsModule: bill shares arrive through the bill.locked event (KAN-79).
@Module({
  imports: [OcrModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, BillShareListener],
})
export class ExpensesModule {}
