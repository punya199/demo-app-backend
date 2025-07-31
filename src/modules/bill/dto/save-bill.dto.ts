import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { Friend, Item } from '../../../entities/bill.entity'

class BillItemDto implements Item {
  @IsString()
  name: string

  @IsNumber()
  price: number

  @IsString()
  id: string

  @IsString()
  @IsOptional()
  payerId?: string | undefined

  @IsString({ each: true })
  @IsOptional()
  friendIds?: string[] | undefined
}

class BillFriendDto implements Friend {
  @IsString()
  name: string

  @IsString()
  id: string
}

export class BillDto {
  @IsNotEmpty()
  @IsArray()
  @Type(() => BillItemDto)
  @ValidateNested()
  @ArrayMinSize(1)
  items: BillItemDto[]

  @IsNotEmpty()
  @IsArray()
  @Type(() => BillFriendDto)
  @ValidateNested()
  @ArrayMinSize(1)
  friends: BillFriendDto[]

  @IsString()
  title: string
}
