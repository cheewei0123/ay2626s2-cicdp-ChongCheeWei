import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// PrismaService is global, so nothing needs importing here
@Module({ controllers: [HealthController] })
export class HealthModule {}
