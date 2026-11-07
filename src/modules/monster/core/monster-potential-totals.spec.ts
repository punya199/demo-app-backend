import { CRITICAL_CHANCE, CRITICAL_MULTIPLIER } from '../battle/battle-engine'
import { capEffects, combatTotals, LIFESTEAL_CAP, THORNS_CAP } from './monster-potential'

describe('combatTotals', () => {
  it('shows the base crit and no evasion with no gear effects', () => {
    expect(combatTotals()).toEqual({
      critRate: Math.round(CRITICAL_CHANCE * 1000) / 10,
      critDamage: Math.round(CRITICAL_MULTIPLIER * 1000) / 10,
      evasion: 0,
    })
  })

  it('adds gear effects in display percent', () => {
    expect(combatTotals({ critChance: 0.1, critDamage: 0.25, evasion: 0.123 })).toEqual({
      critRate: Math.round((CRITICAL_CHANCE + 0.1) * 1000) / 10,
      critDamage: Math.round((CRITICAL_MULTIPLIER + 0.25) * 1000) / 10,
      evasion: 12.3,
    })
  })
})

describe('capEffects lifesteal and thorns', () => {
  it('caps both, leaving lower values alone', () => {
    expect(capEffects({ lifesteal: 9, thorns: 9 })).toEqual({
      lifesteal: LIFESTEAL_CAP,
      thorns: THORNS_CAP,
    })
    expect(capEffects({ lifesteal: 0.1, thorns: 0.2 })).toEqual({ lifesteal: 0.1, thorns: 0.2 })
  })
})
