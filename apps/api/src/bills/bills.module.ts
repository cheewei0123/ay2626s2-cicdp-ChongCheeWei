import { Module } from '@nestjs/common';
import { SplitModule } from '../split/split.module.js';
import { BillsController } from './bills.controller.js';
import { BillsService } from './bills.service.js';
import { ClaimsService } from './claims.service.js';
import { ItemsController } from './items.controller.js';
import { JoinController, ShareController } from './share.controller.js';
import { ShareService } from './share.service.js';
import { SummaryService } from './summary.service.js';

// PrismaService (global) and JwtService (global, from AuthModule) need no import here.
// SplitModule is imported because SummaryService needs SplitService.
@Module({
  imports: [SplitModule],
  controllers: [
    BillsController,
    ItemsController,
    ShareController,
    JoinController,
  ],
  providers: [BillsService, ShareService, ClaimsService, SummaryService],
})
export class BillsModule {}
