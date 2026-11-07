import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import { MonsterRuleError } from './monster-engine'
import {
  assertCanReturnHome,
  petCoreItemId,
  RETURN_HOME_STAGES,
  speciesIdOfPetCore,
} from './pet-core'
import { SPECIES } from './species-data'

const ok = { diedAt: null, stage: EnumMonsterStage.PERFECT, expeditionAreaId: null }

describe('pet core item id', () => {
  it('is unique per species and round-trips', () => {
    const ids = SPECIES.map(species => petCoreItemId(species.id))
    expect(new Set(ids).size).toBe(SPECIES.length)
    expect(speciesIdOfPetCore(petCoreItemId('flame_perfectGood'))).toBe('flame_perfectGood')
    expect(speciesIdOfPetCore('boss_token:x')).toBeNull()
  })
})

describe('assertCanReturnHome', () => {
  it('allows perfect, ultimate and fused only', () => {
    for (const stage of Object.values(EnumMonsterStage)) {
      const attempt = () => assertCanReturnHome({ ...ok, stage })
      if (RETURN_HOME_STAGES.includes(stage)) {
        expect(attempt).not.toThrow()
      } else {
        expect(attempt).toThrow(MonsterRuleError)
      }
    }
    expect(RETURN_HOME_STAGES).toEqual([
      EnumMonsterStage.PERFECT,
      EnumMonsterStage.ULTIMATE,
      EnumMonsterStage.FUSED,
    ])
  })

  it('refuses a gone monster and one still out on an expedition', () => {
    expect(() => assertCanReturnHome({ ...ok, diedAt: new Date() })).toThrow(/gone/)
    expect(() => assertCanReturnHome({ ...ok, expeditionAreaId: 'forest' })).toThrow(/expedition/)
  })
})
