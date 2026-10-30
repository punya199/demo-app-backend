import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { toFighter } from './battle-stats'
import { createEgg, IMonsterState } from './monster-engine'
import { getSpecies } from './species-data'

const NOW = new Date('2026-01-01T03:00:00Z')
const species = getSpecies('flame_adultGood')

const monster = (overrides: Partial<IMonsterState> = {}): IMonsterState => ({
  ...createEgg(EnumMonsterLine.FLAME, NOW),
  speciesId: species.id,
  stage: EnumMonsterStage.ADULT,
  fullness: 4,
  strength: 0,
  weight: species.minWeight,
  ...overrides,
})

describe('toFighter', () => {
  it('uses the species stats, skill and line element', () => {
    const fighter = toFighter(monster({ strength: 0.001 }))
    expect(fighter.element).toBe(EnumMonsterLine.FLAME)
    expect(fighter.skill).toEqual(species.skill)
    expect(fighter.stats.hp).toBe(species.stats.hp)
    expect(fighter.stats.def).toBe(species.stats.def)
  })

  it('adds 5% attack per strength heart', () => {
    expect(toFighter(monster({ strength: 0 })).stats.atk).toBe(species.stats.atk)
    expect(toFighter(monster({ strength: 4 })).stats.atk).toBe(Math.round(species.stats.atk * 1.2))
  })

  it('weakens a hungry monster', () => {
    expect(toFighter(monster({ fullness: 0 })).stats.atk).toBe(Math.round(species.stats.atk * 0.8))
  })

  it('slows an overweight monster', () => {
    expect(toFighter(monster({ weight: species.minWeight * 1.5 })).stats.spd).toBe(
      species.stats.spd
    )
    expect(toFighter(monster({ weight: species.minWeight * 1.5 + 1 })).stats.spd).toBe(
      Math.round(species.stats.spd * 0.8)
    )
  })

  it('refuses an egg', () => {
    expect(() => toFighter(createEgg(EnumMonsterLine.TIDE, NOW))).toThrow()
  })
})
