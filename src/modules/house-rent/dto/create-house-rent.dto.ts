import { Type } from 'class-transformer'
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  IAirCondition,
  IElectricitySummaryData,
  IHouseRent,
  IInternet,
} from '../../../db/entities/house-rent'
import { IElectricity, IHouseRentDetail } from '../../../db/entities/house-rent-detail.entity'
import { IElectricityUnit, IHouseRentMember } from '../../../db/entities/house-rent-member.entity'

export class ElectricityDto implements IElectricity {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalPrice: number

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unit: number
}

export class ElectricityUnitDto implements IElectricityUnit {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  prev: number

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  current: number

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  diff: number
}

export class HouseRentDetailDto implements IHouseRentDetail {
  @IsUUID()
  @IsOptional()
  id?: string

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  houseRentPrice: number

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  waterPrice: number

  @IsNotEmpty()
  @Type(() => ElectricityDto)
  @ValidateNested()
  electricity: IElectricity

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  month: Date

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[]
}

export class HouseRentMemberDto implements IHouseRentMember {
  @IsUUID()
  @IsOptional()
  id?: string

  @IsUUID()
  @IsNotEmpty()
  userId: string

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  airConditionUnit: number

  @IsNotEmpty()
  @Type(() => ElectricityUnitDto)
  @ValidateNested()
  electricityUnit: IElectricityUnit

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  payInternetMonthIds: string[]

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  payElectricityMonthIds: string[]
}

export class InternetDto implements IInternet {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerMonth: number
}

export class AirConditionDto implements IAirCondition {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerUnit: number
}

export class ElectricitySummaryDto implements IElectricitySummaryData {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalUnit: number

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalPrice: number

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerUnit: number

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  shareUnit: number
}

export class CreateHouseRentBodyDto implements IHouseRent {
  @IsUUID()
  @IsOptional()
  id?: string

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
  @Min(0)
  @Type(() => Number)
  baseHouseRent: number

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
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
