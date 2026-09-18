import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { EnumPollType } from '../../../db/entities/poll.entity'

export class CreatePollBodyDto {
  @IsNotEmpty()
  @IsString()
  title: string

  @IsOptional()
  @IsString()
  description?: string

  @IsNotEmpty()
  @IsEnum(EnumPollType)
  pollType: EnumPollType

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  options: string[]

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelections?: number

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  closesAt?: Date
}
