import { Type } from 'class-transformer'
import { IsArray, IsNotEmpty, IsNumber, IsString, IsUUID, ValidateNested } from 'class-validator'
import { IAirCondition, IHouseRent, IInternet } from '../../../db/entities/house-rent'
import { IHouseRentDetail } from '../../../db/entities/house-rent-detail.entity'
import { IHouseRentMember } from '../../../db/entities/house-rent-member.entity'
import {
  AirConditionDto,
  HouseRentDetailDto,
  HouseRentMemberDto,
  InternetDto,
} from './create-house-rent.dto'

export class EditHouseRentBodyDto implements IHouseRent {
  @IsNotEmpty()
  @IsString()
  name: string

  @IsNotEmpty()
  @IsArray()
  @Type(() => HouseRentDetailDto)
  @ValidateNested({ each: true })
  rents: IHouseRentDetail[]

  @IsNotEmpty()
  @IsArray()
  @Type(() => HouseRentMemberDto)
  @ValidateNested({ each: true })
  members: IHouseRentMember[]

  @IsNotEmpty()
  @IsNumber()
  baseHouseRent: number

  @IsNotEmpty()
  @IsNumber()
  paymentFee: number

  @IsNotEmpty()
  @Type(() => InternetDto)
  @ValidateNested()
  internet: IInternet

  @IsNotEmpty()
  @Type(() => AirConditionDto)
  @ValidateNested()
  airCondition: IAirCondition

  @IsNotEmpty()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds: string[]
}
