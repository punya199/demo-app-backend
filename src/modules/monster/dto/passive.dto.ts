import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class PassiveNodeBodyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(32)
  nodeId: string
}

export class PassiveMasteryBodyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(32)
  nodeId: string

  @IsInt()
  @Min(0)
  @Max(2)
  option: number
}

// The whole tree as edited on the client; the server checks every part of it.
export class PassiveSaveBodyDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  nodeIds: string[]

  @IsObject()
  masteries: Record<string, number>

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  ascendancyNodeIds: string[]
}
