import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { IFighterEffects } from '../battle-stats'
import { NO_EQUIPMENT_BONUS } from '../equipment-data'
import { createEgg } from '../monster-engine'
import { toArenaFighter } from './arena-fighter'
import { ARENA_HP_SCALE, LINE_ACC, LINE_EVA, LINE_RES } from './arena-rules'
import { toArenaStatsView } from './arena-stats'

const NOW = new Date('2026-01-01T03:00:00Z')

const pet = {
  ...createEgg(EnumMonsterLine.FLAME, NOW),
  speciesId: 'flame_adultGood',
  stage: EnumMonsterStage.ADULT,
  fullness: 4,
  strength: 3,
  weight: 40,
}

const statsWith = (effects: IFighterEffects) =>
  toArenaStatsView(toArenaFighter(pet, { ...NO_EQUIPMENT_BONUS, effects }))

describe('toArenaStatsView', () => {
  it('reports only the line stats for a pet without effects', () => {
    const view = statsWith({})
    expect(view.eva).toBe(LINE_EVA.flame)
    expect(view.acc).toBe(LINE_ACC.flame)
    expect(view.res).toBe(LINE_RES.flame)
    expect(view.fightHp).toBeGreaterThan(0)
    expect(view).toMatchObject({
      regenPct: 0,
      regenPerSec: 0,
      lifesteal: 0,
      thorns: 0,
      damageCut: 0,
      startShield: 0,
      firstStrike: false,
      onBasic: [],
      periodicShield: null,
      lastStand: null,
    })
  })

  it('reads gear effects the way the fight does', () => {
    const view = statsWith({ regenPct: 0.02, lifesteal: 0.06, thorns: 0.04, damageCut: 0.08 })
    expect(view.regenPct).toBe(2)
    expect(view.lifesteal).toBe(6)
    expect(view.thorns).toBe(4)
    expect(view.damageCut).toBe(8)
    // HP per second is the share of the fight HP, to one decimal.
    expect(view.regenPerSec).toBeCloseTo((view.fightHp * 2) / 100, 1)
  })

  it('shows fight HP with the arena scale applied', () => {
    const spec = toArenaFighter(pet, NO_EQUIPMENT_BONUS)
    expect(toArenaStatsView(spec).fightHp).toBe(Math.round(spec.hp * ARENA_HP_SCALE))
  })
})
