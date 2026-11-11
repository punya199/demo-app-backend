import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { simulateBattle } from '../battle/battle-engine'
import { IFighter, toFighter } from '../battle/battle-stats'
import { createEgg } from '../core/monster-engine'
import { arenaWinRate, wellCaredArenaFighter } from './arena-test-helpers'
import { PVP_SEASON_MIN_FIGHTS } from '../core/monster-rules'
import {
  getNpcArena,
  getSeasonReward,
  isPvpStage,
  npcStageOf,
  PVP_NPCS,
  PVP_SEASON_REWARDS,
  PVP_STAGES,
} from './pvp-data'

const NOW = new Date('2026-01-01T03:00:00Z')
const SPECIES: Record<string, string> = {
  [EnumMonsterStage.ADULT]: 'adultGood',
  [EnumMonsterStage.PERFECT]: 'perfectGood',
  [EnumMonsterStage.ULTIMATE]: 'ultimate',
}
const LINES = [EnumMonsterLine.FLAME, EnumMonsterLine.TIDE, EnumMonsterLine.LEAF]

// A well-fed, fully trained monster of the form, on the given line.
const wellCared = (line: EnumMonsterLine, stage: EnumMonsterStage) =>
  toFighter({
    ...createEgg(line, NOW),
    speciesId: `${line}_${SPECIES[stage]}`,
    stage,
    fullness: 4,
    strength: 4,
    weight: 40,
  })

const winRate = (player: IFighter, enemy: IFighter, fights = 300) => {
  let wins = 0
  for (let seed = 1; seed <= fights; seed++) {
    wins += simulateBattle(player, enemy, seed).won ? 1 : 0
  }
  return wins / fights
}

describe('arena rivals', () => {
  it.each(PVP_STAGES)('climb from about 75% to about 25%: %s', stage => {
    const rates = PVP_NPCS.filter(npc => npc.stage === stage).map(npc => {
      const perLine = LINES.map(line =>
        arenaWinRate(wellCaredArenaFighter(line, stage), getNpcArena(npc), 40)
      )
      return perLine.reduce((sum, rate) => sum + rate, 0) / perLine.length
    })
    ;[0.75, 0.5, 0.25].forEach((target, index) => {
      expect(Math.abs(rates[index] - target)).toBeLessThanOrEqual(0.2)
    })
  })

  it.each(PVP_STAGES)('keep a mirror match even: %s', stage => {
    const fighter = wellCaredArenaFighter(EnumMonsterLine.FLAME, stage)
    const rate = arenaWinRate(fighter, fighter, 100)
    expect(rate).toBeGreaterThan(0.35)
    expect(rate).toBeLessThan(0.65)
  })
})

describe('PvP balance', () => {
  it('lets equal monsters of the same form win about half the time', () => {
    for (const stage of PVP_STAGES) {
      const fighter = wellCared(EnumMonsterLine.FLAME, stage)
      expect(winRate(fighter, fighter)).toBeGreaterThan(0.4)
      expect(winRate(fighter, fighter)).toBeLessThan(0.6)
    }
  })

  it('makes the rating-900 / 1000 / 1100 rivals roughly 75% / 50% / 25% for a well-cared monster', () => {
    for (const stage of PVP_STAGES) {
      const rivals = PVP_NPCS.filter(npc => npc.stage === stage)
      const rates = rivals.map(npc => {
        // Same element as the rival, so the element triangle doesn't skew the calibration.
        const rate = LINES.map(line =>
          winRate(wellCared(line, stage), { ...npc.fighter, element: line })
        )
        return rate.reduce((sum, value) => sum + value, 0) / rate.length
      })
      expect(rates[0]).toBeGreaterThan(0.6)
      expect(rates[0]).toBeGreaterThan(rates[1])
      expect(rates[1]).toBeGreaterThan(rates[2])
      expect(rates[1]).toBeGreaterThan(0.35)
      expect(rates[1]).toBeLessThan(0.65)
      expect(rates[2]).toBeLessThan(0.4)
    }
  })

  it('never lets an underfed, untrained monster beat the middle rival', () => {
    for (const stage of PVP_STAGES) {
      const tired = toFighter({
        ...createEgg(EnumMonsterLine.FLAME, NOW),
        speciesId: `flame_${SPECIES[stage]}`,
        stage,
        fullness: 0,
        strength: 0,
        weight: 40,
      })
      const middle = PVP_NPCS.find(npc => npc.stage === stage && npc.rating === 1000)!
      expect(winRate(tired, middle.fighter)).toBeLessThan(0.1)
    }
  })
})

describe('getSeasonReward without a catch-all tier', () => {
  it('has no reward when no tier matches', () => {
    const saved = [...PVP_SEASON_REWARDS]
    try {
      PVP_SEASON_REWARDS.length = 0
      expect(getSeasonReward(1, PVP_SEASON_MIN_FIGHTS)).toBeNull()
    } finally {
      PVP_SEASON_REWARDS.push(...saved)
    }
  })
})

describe('Fused pets in the arena', () => {
  it('may fight, and meet the Ultimate rivals', () => {
    expect(isPvpStage(EnumMonsterStage.FUSED)).toBe(true)
    expect(isPvpStage(EnumMonsterStage.BABY_2)).toBe(false)
    expect(npcStageOf(EnumMonsterStage.FUSED)).toBe(EnumMonsterStage.ULTIMATE)
    expect(npcStageOf(EnumMonsterStage.ADULT)).toBe(EnumMonsterStage.ADULT)
    expect(
      PVP_NPCS.some(npc => npc.stage === (npcStageOf(EnumMonsterStage.FUSED) as EnumMonsterStage))
    ).toBe(true)
  })
})
