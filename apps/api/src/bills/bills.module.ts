import { Module } from '@nestjs/common';
import { BillsController } from './bills.controller.js';
import { BillsService } from './bills.service.js';
import { ClaimsService } from './claims.service.js';
import { ItemsController } from './items.controller.js';
import { JoinController, ShareController } from './share.controller.js';
import { ShareService } from './share.service.js';

// PrismaService (global) and JwtService (global, from AuthModule) need no import here
@Module({
  controllers: [
    BillsController,
    ItemsController,
    ShareController,
    JoinController,
  ],
  providers: [BillsService, ShareService, ClaimsService],
})
export class BillsModule {}
