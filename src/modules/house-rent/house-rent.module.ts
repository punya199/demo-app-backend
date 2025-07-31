import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AttachmentEntity } from '../../db/entities/attachment.entity'
import { HouseRentEntity } from '../../db/entities/house-rent'
import { HouseRentDetailEntity } from '../../db/entities/house-rent-detail.entity'
import { HouseRentMemberEntity } from '../../db/entities/house-rent-member.entity'
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
