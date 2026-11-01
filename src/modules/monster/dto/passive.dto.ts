import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class PassiveNodeBodyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(32)
  nodeId: string
}
