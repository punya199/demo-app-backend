import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { STAGE_COUNT } from '../../libs/td-sim'
import {
  STAGE_FIRST_CLEAR_GEMS,
  STAGE_SWEEP_REWARDS,
  STAR_MIN_HP,
  SWEEP_MIN_STARS,
} from './stage.config'

export interface IStageProgress {
  stageId: number
  stars: number
}

export interface IStageClearPlan {
  firstClear: boolean
  stars: number
  gems: number
}

// Pure. Stars come only from the replayed result: 0 for a loss, else 1 to 3 by HQ health left.
export const starsFor = (status: 'won' | 'lost', hp: number): number => {
  if (status !== 'won') return 0
  return 1 + (hp >= STAR_MIN_HP[0] ? 1 : 0) + (hp >= STAR_MIN_HP[1] ? 1 : 0)
}

// Pure. Stage 1 is always open; stage N opens once stage N-1 has been cleared.
export const assertStageUnlocked = (stageId: number, progress: readonly IStageProgress[]): void => {
  if (!Number.isInteger(stageId) || stageId < 1 || stageId > STAGE_COUNT) {
    throw new BadRequestException('Unknown stage')
  }
  if (stageId > 1 && !progress.some(p => p.stageId === stageId - 1 && p.stars >= 1)) {
    throw new ForbiddenException('Stage is locked')
  }
}

// Pure. `previous` is the best stars already stored (null when the stage was never cleared).
// Gems are paid only on the first clear; later clears can only raise the best stars.
export const planStageClear = (
  stageId: number,
  previous: number | null,
  earned: number
): IStageClearPlan => {
  const firstClear = earned >= 1 && (previous === null || previous < 1)
  return {
    firstClear,
    stars: Math.max(previous ?? 0, earned),
    gems: firstClear ? STAGE_FIRST_CLEAR_GEMS[stageId - 1] : 0,
  }
}

// Pure. The stage list the screen draws.
export const stageList = (progress: readonly IStageProgress[]) =>
  Array.from({ length: STAGE_COUNT }, (_, i) => {
    const stageId = i + 1
    const stars = progress.find(p => p.stageId === stageId)?.stars ?? 0
    return {
      stageId,
      stars,
      cleared: stars >= 1,
      unlocked: stageId === 1 || progress.some(p => p.stageId === stageId - 1 && p.stars >= 1),
      firstClearGems: STAGE_FIRST_CLEAR_GEMS[i],
    }
  })

// Pure. A sweep needs the stage unlocked and cleared with 3 stars; it pays the repeatable
// reward only, never the first-clear gems.
export const planSweep = (stageId: number, progress: readonly IStageProgress[]) => {
  assertStageUnlocked(stageId, progress)
  const stars = progress.find(p => p.stageId === stageId)?.stars ?? 0
  if (stars < SWEEP_MIN_STARS) throw new ConflictException('Sweep needs 3 stars on this stage')
  return { ...STAGE_SWEEP_REWARDS[stageId - 1] }
}
