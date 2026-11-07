import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator'
import { ADVENTURE_SKIP_MAX_RUNS } from '../core/monster-rules'

export class AdventureBattleBodyDto {
  @IsNotEmpty()
  @IsString()
  stageId: string
}

export class AdventureSkipBodyDto {
  @IsNotEmpty()
  @IsString()
  stageId: string

  @IsInt()
  @Min(1)
  @Max(ADVENTURE_SKIP_MAX_RUNS)
  runs: number
}
