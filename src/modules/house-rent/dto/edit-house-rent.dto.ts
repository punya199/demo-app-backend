import { Type } from 'class-transformer'
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator'
import {
  IAirCondition,
  IElectricitySummaryData,
  IHouseRent,
  IInternet,
} from '../../../entities/house-rent'
import { IElectricity, IHouseRentDetail } from '../../../entities/house-rent-detail.entity'
import { IElectricityUnit, IHouseRentMember } from '../../../entities/house-rent-member.entity'

export class ElectricityDto implements IElectricity {
  @IsNotEmpty()
  @IsNumber()
  totalPrice: number

  @IsNotEmpty()
  @IsNumber()
  unit: number
}

export class ElectricityUnitDto implements IElectricityUnit {
  @IsNotEmpty()
  @IsNumber()
  prev: number

  @IsNotEmpty()
  @IsNumber()
  current: number

  @IsNotEmpty()
  @IsNumber()
  diff: number
}

export class HouseRentDetailDto implements IHouseRentDetail {
  @IsUUID()
  @IsOptional()
  id?: string

  @IsNotEmpty()
  @IsNumber()
  houseRentPrice: number

  @IsNotEmpty()
  @IsNumber()
  waterPrice: number

  @IsNotEmpty()
  @Type(() => ElectricityDto)
  @ValidateNested()
  electricity: IElectricity

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  month: Date
}

export class HouseRentMemberDto implements IHouseRentMember {
  @IsUUID()
  @IsOptional()
  id?: string

  @IsNotEmpty()
  @IsString()
  name: string

  @IsNotEmpty()
  @IsNumber()
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
  pricePerMonth: number
}

export class AirConditionDto implements IAirCondition {
  @IsNotEmpty()
  @IsNumber()
  pricePerUnit: number

  @IsNotEmpty()
  @IsNumber()
  unit: number
}

export class ElectricitySummaryDto implements IElectricitySummaryData {
  @IsNotEmpty()
  @IsNumber()
  totalUnit: number

  @IsNotEmpty()
  @IsNumber()
  totalPrice: number

  @IsNotEmpty()
  @IsNumber()
  pricePerUnit: number

  @IsNotEmpty()
  @IsNumber()
  shareUnit: number
}

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
}
