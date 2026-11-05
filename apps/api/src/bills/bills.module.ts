import { Module } from '@nestjs/common';
import { BillsController } from './bills.controller.js';
import { BillsService } from './bills.service.js';
import { ItemsController } from './items.controller.js';

// PrismaService (global) and JwtService (global, from AuthModule) need no import here
@Module({
  controllers: [BillsController, ItemsController],
  providers: [BillsService],
})
export class BillsModule {}
