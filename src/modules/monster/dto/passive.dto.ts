import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator'

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
