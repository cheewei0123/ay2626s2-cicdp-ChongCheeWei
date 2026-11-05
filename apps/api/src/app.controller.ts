import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    debugger; // deliberate lint error to show CI blocking the merge
    return this.appService.getHello();
  }
}
