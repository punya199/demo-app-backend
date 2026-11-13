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
import {
  DEFAULT_MAX_TICKS,
  MAX_DRAFT_TICKS,
  MAX_REPLAY_INPUTS,
  TILE_COUNT,
} from '../../../libs/td-sim'

// Fight time plus the separately capped draft time (the sim's own ceilings).
const MAX_LOG_TICKS = DEFAULT_MAX_TICKS + MAX_DRAFT_TICKS

export class TdBattleInputDto {
  @IsInt()
  @Min(0)
  @Max(MAX_LOG_TICKS)
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
  @Max(MAX_LOG_TICKS)
  ticks: number

  @IsArray()
  @ArrayMaxSize(MAX_REPLAY_INPUTS)
  @ValidateNested({ each: true })
  @Type(() => TdBattleInputDto)
  inputs: TdBattleInputDto[]
}
