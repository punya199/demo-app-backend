import { EnumMonsterStage } from '../../db/entities/monster.entity'
import { IMonsterState, MonsterRuleError } from './monster-engine'
import { mergePotential } from './monster-potential'
import { MAX_STAMINA } from './monster-rules'
import { fusedSpeciesId, getSpecies, isSameGroup } from './species-data'

// Ultimate Merge rules (pure). MonsterService.merge() locks both parents, calls these, charges the
// wallet and saves the result in one transaction.

// Both parents must be living Ultimates (either branch) that are healthy and at home.
export const assertCanMerge = (first: IMonsterState, second: IMonsterState) => {
  for (const parent of [first, second]) {
    if (parent.diedAt) {
      throw new MonsterRuleError('Monster is no longer alive')
    }
    if (parent.stage !== EnumMonsterStage.ULTIMATE) {
      throw new MonsterRuleError('Only monsters in their final form can be merged')
    }
    if (parent.isSick) {
      throw new MonsterRuleError('Monster is sick')
    }
    if (parent.expeditionAreaId) {
      throw new MonsterRuleError('Monster is on an expedition')
    }
  }
  // Natural and spiritual elements do not mix.
  if (!isSameGroup(first.line, second.line)) {
    throw new MonsterRuleError('Natural and spiritual elements cannot be merged')
  }
}

// The fused monster: a fresh life (age resets) of the form for the parents' lines. `base` is the
// parent the player chose: its line is the fused monster's element and skill. Wins and losses
// start from zero, care state is the average of the parents'.
export const createFused = (
  first: IMonsterState,
  second: IMonsterState,
  base: IMonsterState,
  now: Date
): IMonsterState => {
  assertCanMerge(first, second)
  const species = getSpecies(fusedSpeciesId(first.line, second.line))
  return {
    line: base.line,
    // Keeps the better roll of each stat, so merging good pets pays.
    potential: mergePotential(first.potential, second.potential),
    speciesId: species.id,
    stage: species.stage,
    fullness: (first.fullness + second.fullness) / 2,
    strength: (first.strength + second.strength) / 2,
    stamina: MAX_STAMINA,
    weight: Math.max(species.minWeight, Math.round((first.weight + second.weight) / 2)),
    poops: 0,
    isSick: false,
    careMistakes: 0,
    trainCount: 0,
    wins: 0,
    losses: 0,
    poopMinutes: 0,
    hungryMinutes: 0,
    weakMinutes: 0,
    sickMinutes: 0,
    stageMinutes: 0,
    ageMinutes: 0,
    bornAt: now,
    lastTickAt: now,
    lastSeenAt: now,
    lastTrainedAt: null,
    lastAutoBattleAt: null,
    lastMinigameAt: null,
    expeditionAreaId: null,
    expeditionMinutes: 0,
    expeditionRate: 0,
    expeditionReturned: false,
    diedAt: null,
    deathCause: null,
  }
}
