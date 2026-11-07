import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import { ADVENTURE_AREAS } from './adventure-data'
import {
  calcExpeditionCoins,
  calcExpeditionDrops,
  getExpeditionBaseRate,
  getExpeditionRate,
} from './idle-data'
import { STAGE_BASE_STATS } from '../core/species-data'

describe('idle rewards', () => {
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
