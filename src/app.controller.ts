import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common'
import { AppService } from './app.service'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello()
  }

  @Version(VERSION_NEUTRAL)
  @Get('health')
  health(): string {
    return 'OK'
  }
}
