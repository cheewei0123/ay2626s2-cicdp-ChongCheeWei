import { Module } from '@nestjs/common';
import { BillsModule } from '../bills/bills.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

// Imports BillsModule for SummaryService (who owes what); PrismaService is global
@Module({
  imports: [BillsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
