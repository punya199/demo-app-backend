import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { MINIGAME_ROUNDS } from '../monster-rules'

export class MinigameBodyDto {
  @IsInt()
  @Min(0)
  @Max(MINIGAME_ROUNDS)
  hits: number

  // Which living monster plays; defaults to the selected one.
  @IsOptional()
  @IsUUID()
  monsterId?: string
}

export class StaminaRefillBodyDto {
  // Which living monster to refill; defaults to the selected one.
  @IsOptional()
  @IsUUID()
  monsterId?: string
}
