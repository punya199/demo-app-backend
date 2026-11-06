import { EnumMonsterStage } from '../../db/entities/monster.entity'
import { IMonsterState, MonsterRuleError } from './monster-engine'

// "Return to the home planet" (กลับดาว): a grown pet leaves for good and leaves one Pet Core behind.
// A core is a bag item (stackable) keyed by the species it came from, so one species = one core
// kind. Nothing uses cores yet; they are stored for the craft feature to come.

export const PET_CORE_ITEM_PREFIX = 'petcore:'
export const PET_CORES_PER_RETURN = 1

// Perfect and beyond: an adult is too cheap to turn into a core.
export const RETURN_HOME_STAGES: readonly EnumMonsterStage[] = [
  EnumMonsterStage.PERFECT,
  EnumMonsterStage.ULTIMATE,
  EnumMonsterStage.FUSED,
]

export const petCoreItemId = (speciesId: string) => `${PET_CORE_ITEM_PREFIX}${speciesId}`

// The species a core item id came from, or null when the id is not a Pet Core.
export const speciesIdOfPetCore = (itemId: string) =>
  itemId.startsWith(PET_CORE_ITEM_PREFIX) ? itemId.slice(PET_CORE_ITEM_PREFIX.length) : null

// Mirrored by getReturnHomeBlocker in the web app's tamagotchi-helper.ts, so keep them in step.
export const assertCanReturnHome = (
  monster: Pick<IMonsterState, 'diedAt' | 'stage' | 'expeditionAreaId'>
) => {
  if (monster.diedAt) {
    throw new MonsterRuleError('This monster is already gone')
  }
  if (!RETURN_HOME_STAGES.includes(monster.stage)) {
    throw new MonsterRuleError('Only a monster in its perfect form or beyond can return home')
  }
  if (monster.expeditionAreaId) {
    throw new MonsterRuleError('Bring the monster back from its expedition first')
  }
}
