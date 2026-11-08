import { Module } from '@nestjs/common';
import { SplitService } from './split.service.js';

// The money engine as its own module. Other modules import SplitModule to use it,
// so the split logic has one home and no access to the database or HTTP.
@Module({
  providers: [SplitService],
  exports: [SplitService],
})
export class SplitModule {}
