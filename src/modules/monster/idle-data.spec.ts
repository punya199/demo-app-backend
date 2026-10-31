import { EnumMonsterStage } from '../../db/entities/monster.entity'
import { ADVENTURE_AREAS } from './adventure-data'
import {
  calcAutoBattleReward,
  calcExpeditionCoins,
  calcExpeditionDrops,
  getExpeditionBaseRate,
  getExpeditionRate,
} from './idle-data'
import { AUTO_BATTLE_COOLDOWN_MS } from './monster-rules'
import { STAGE_BASE_STATS } from './species-data'

describe('idle rewards', () => {
  it('pays auto-battle a little more per hour than an expedition in the same area', () => {
    const fightsPerHour = 3_600_000 / AUTO_BATTLE_COOLDOWN_MS
    for (const area of ADVENTURE_AREAS) {
      const normalStages = area.stages.filter(stage => !stage.isBoss)
      const autoPerHour =
        (normalStages.reduce((sum, stage) => sum + calcAutoBattleReward(stage), 0) /
          normalStages.length) *
        fightsPerHour
      const expeditionPerHour = getExpeditionRate(area, STAGE_BASE_STATS[area.recommendedStage])
      expect(expeditionPerHour).toBe(getExpeditionBaseRate(area.id))
      expect(autoPerHour).toBeGreaterThan(expeditionPerHour)
      expect(autoPerHour).toBeLessThanOrEqual(expeditionPerHour * 1.5)
    }
  })

  it('scales the expedition rate with power, within bounds', () => {
    const area = ADVENTURE_AREAS[0]
    const base = getExpeditionBaseRate(area.id)
    const strong = getExpeditionRate(area, STAGE_BASE_STATS[EnumMonsterStage.ULTIMATE])
    expect(strong).toBe(base * 1.5)
    expect(getExpeditionRate(area, { hp: 1, atk: 1, def: 1, spd: 1 })).toBe(base * 0.5)
  })

  it('floors coins and drops', () => {
    expect(calcExpeditionCoins(90, 100)).toBe(150)
    expect(calcExpeditionCoins(1, 100)).toBe(1)
    expect(calcExpeditionDrops(239)).toBe(0)
    expect(calcExpeditionDrops(480)).toBe(2)
  })
})
