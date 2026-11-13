import { Module } from '@nestjs/common'
import { TdProfileController } from './td-profile.controller'
import { TdProfileService } from './td-profile.service'

@Module({
  controllers: [TdProfileController],
  providers: [TdProfileService],
  exports: [TdProfileService],
})
export class TdModule {}
