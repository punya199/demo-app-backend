// Pure enhancement rules: no DB, no Nest. EquipmentService runs resolveEnhance() inside a locked
// transaction after charging the cost, with a server-side RNG.

export const MAX_ENHANCE_LEVEL = 15
// Each consecutive failure on a piece adds this much success chance, up to the cap.
export const PITY_PER_FAIL = 0.02
export const PITY_MAX = 0.2

export type EnhanceFailure = 'material' | 'drop' | 'drop_or_break'

export interface IEnhanceStep {
  level: number // the level this attempt tries to reach
  rate: number
  onFail: EnhanceFailure
  coin: number
  stones: number
}

const rateFor = (level: number) =>
  [1, 1, 1, 1, 1, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1, 0.05][level - 1]

const failureFor = (level: number): EnhanceFailure =>
  level <= 9 ? 'material' : level <= 12 ? 'drop' : 'drop_or_break'

// Every attempt spends the coins and stones whether it works or not.
export const ENHANCE_STEPS: IEnhanceStep[] = Array.from(
  { length: MAX_ENHANCE_LEVEL },
  (_, index) => {
    const level = index + 1
    return {
      level,
      rate: rateFor(level),
      onFail: level <= 5 ? 'material' : failureFor(level),
      coin: 10 * level * level,
      stones: 1 + Math.floor((level - 1) / 3),
    }
  }
)

export const getEnhanceStep = (currentLevel: number) => ENHANCE_STEPS[currentLevel]

export const effectiveRate = (step: IEnhanceStep, pity: number) =>
  step.rate >= 1 ? 1 : Math.min(1, step.rate + Math.min(PITY_MAX, pity * PITY_PER_FAIL))

// Protect scrolls only matter when a failure would cost the piece a level or break it.
export const canProtect = (currentLevel: number) =>
  currentLevel < MAX_ENHANCE_LEVEL && getEnhanceStep(currentLevel).onFail !== 'material'

export interface IEnhanceResult {
  success: boolean
  rate: number
  newLevel: number
  newPity: number
  broke: boolean
  protectUsed: boolean
}

// `rand` returns [0, 1). One roll decides success; a second decides break on the last tier.
export const resolveEnhance = (
  currentLevel: number,
  pity: number,
  useProtect: boolean,
  rand: () => number
): IEnhanceResult => {
  const step = getEnhanceStep(currentLevel)
  const rate = effectiveRate(step, pity)
  if (rand() < rate) {
    return {
      success: true,
      rate,
      newLevel: currentLevel + 1,
      newPity: 0,
      broke: false,
      protectUsed: false,
    }
  }

  const newPity = pity + 1
  if (step.onFail === 'material') {
    return {
      success: false,
      rate,
      newLevel: currentLevel,
      newPity,
      broke: false,
      protectUsed: false,
    }
  }
  if (useProtect) {
    return {
      success: false,
      rate,
      newLevel: currentLevel,
      newPity,
      broke: false,
      protectUsed: true,
    }
  }
  const broke = step.onFail === 'drop_or_break' && rand() < 0.5
  return {
    success: false,
    rate,
    newLevel: broke ? currentLevel : currentLevel - 1,
    newPity,
    broke,
    protectUsed: false,
  }
}
