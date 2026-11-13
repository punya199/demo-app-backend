import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import { DEFAULT_MAX_TICKS, TILE_COUNT } from '../../../libs/td-sim'
import { MAX_INPUTS } from '../battle.config'

export class TdBattleInputDto {
  @IsInt()
  @Min(0)
  @Max(DEFAULT_MAX_TICKS)
  tick: number

  @IsIn(['summon', 'merge', 'pick'])
  type: 'summon' | 'merge' | 'pick'

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(TILE_COUNT - 1)
  tile?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(TILE_COUNT - 1)
  from?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(TILE_COUNT - 1)
  to?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  index?: number
}

// Only the seed and the log are read. Anything else the client sends (a result, damage, rewards)
// is never looked at.
export class TdBattleFinishDto {
  @IsInt()
  @Min(0)
  @Max(2 ** 32 - 1)
  seed: number

  @IsInt()
  @Min(1)
  @Max(DEFAULT_MAX_TICKS)
  ticks: number

  @IsArray()
  @ArrayMaxSize(MAX_INPUTS)
  @ValidateNested({ each: true })
  @Type(() => TdBattleInputDto)
  inputs: TdBattleInputDto[]
}
