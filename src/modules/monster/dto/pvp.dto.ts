import { IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator'
import { PVP_DISPLAY_NAME_MAX, PVP_DISPLAY_NAME_MIN } from '../monster-rules'

const SEASON_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export class SetDefenseBodyDto {
  // The arena name other players see. No markup characters; the page renders it as plain text too.
  @IsOptional()
  @IsString()
  @Length(PVP_DISPLAY_NAME_MIN, PVP_DISPLAY_NAME_MAX)
  @Matches(/^[^<>&"'`\p{Cc}]+$/u)
  displayName?: string
}

export class PvpBattleBodyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  opponentId: string
}

export class ClaimSeasonBodyDto {
  @IsNotEmpty()
  @Matches(SEASON_PATTERN)
  season: string
}

export class LeaderboardQueryDto {
  @IsOptional()
  @Matches(SEASON_PATTERN)
  season?: string
}
