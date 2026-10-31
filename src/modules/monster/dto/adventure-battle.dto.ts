import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class AdventureBattleBodyDto {
  @IsNotEmpty()
  @IsString()
  stageId: string

  @IsOptional()
  @IsBoolean()
  auto?: boolean
}
