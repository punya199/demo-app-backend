import { IsNotEmpty, IsUUID } from 'class-validator'

export class MergeMonstersBodyDto {
  @IsNotEmpty()
  @IsUUID()
  firstId: string

  @IsNotEmpty()
  @IsUUID()
  secondId: string

  // Which of the two gives the fused monster its element and skill.
  @IsNotEmpty()
  @IsUUID()
  baseId: string
}
