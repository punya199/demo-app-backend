import { IsInt, Max, Min } from 'class-validator'
import { MINIGAME_ROUNDS } from '../monster-rules'

export class MinigameBodyDto {
  @IsInt()
  @Min(0)
  @Max(MINIGAME_ROUNDS)
  hits: number
}
