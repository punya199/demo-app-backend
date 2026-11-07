import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { createEgg, IMonsterState } from '../core/monster-engine'
import { LEGACY_POTENTIAL } from '../core/monster-potential'
import { fusedSpeciesId, getSpecies } from '../core/species-data'
import { NO_EQUIPMENT_BONUS } from '../equipment/equipment-data'
import { toFighter } from './battle-stats'

const NOW = new Date('2026-01-01T03:00:00Z')
const adult = (overrides: Partial<IMonsterState> = {}): IMonsterState => ({
  ...createEgg(EnumMonsterLine.FLAME, NOW),
  speciesId: 'flame_adultGood',
  stage: EnumMonsterStage.ADULT,
  fullness: 4,
  strength: 0,
  weight: getSpecies('flame_adultGood').minWeight,
  ...overrides,
})

describe('toFighter effects, names and fused forms', () => {
  it('has no effects at all for a legacy monster without gear', () => {
    const fighter = toFighter(adult({ potential: null }))
    expect(fighter.effects).toBeUndefined()
    expect(fighter).not.toHaveProperty('nickname')
  })

  it('turns rolled extras into effects and adds them to gear effects', () => {
    const potential = { ...LEGACY_POTENTIAL, critRate: 1, critDamage: 1, evasion: 1 }
    const bare = toFighter(adult({ potential })).effects!
    expect(bare.critChance).toBeGreaterThan(0)
    expect(bare.critDamage).toBeGreaterThan(0)
    expect(bare.evasion).toBeGreaterThan(0)
    const gear = { ...NO_EQUIPMENT_BONUS, effects: { critDamage: 0.1, thorns: 0.05 } }
    const geared = toFighter(adult({ potential }), gear).effects!
    expect(geared.critDamage).toBeCloseTo(bare.critDamage! + 0.1, 5)
    expect(geared.thorns).toBe(0.05)
    expect(geared.evasion).toBe(bare.evasion)
  })

  it('carries the pet nickname', () => {
    expect(toFighter(adult({ nickname: 'Pip' })).nickname).toBe('Pip')
  })

  it('fights a fused form with its chosen base line and that line skill', () => {
    const species = getSpecies(fusedSpeciesId(EnumMonsterLine.FLAME, EnumMonsterLine.TIDE))
    const fused = adult({
      speciesId: species.id,
      stage: EnumMonsterStage.FUSED,
      line: EnumMonsterLine.TIDE,
      weight: species.minWeight,
    })
    const fighter = toFighter(fused)
    expect(fighter.element).toBe(EnumMonsterLine.TIDE)
    expect(fighter.skill).toEqual(species.skillByLine![EnumMonsterLine.TIDE])
  })
})
