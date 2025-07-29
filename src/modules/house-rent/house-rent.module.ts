import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AttachmentEntity } from '../../entities/attachment.entity'
import { HouseRentEntity } from '../../entities/house-rent'
import { HouseRentDetailEntity } from '../../entities/house-rent-detail.entity'
import { HouseRentMemberEntity } from '../../entities/house-rent-member.entity'
import { HouseRentController } from './house-rent.controller'
import { HouseRentService } from './house-rent.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HouseRentEntity,
      HouseRentDetailEntity,
      HouseRentMemberEntity,
      AttachmentEntity,
    ]),
  ],
  controllers: [HouseRentController],
  providers: [HouseRentService],
})
export class HouseRentModule {}
