import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { simulateBattle } from './battle-engine'
import { IFighter, toFighter } from './battle-stats'
import { createEgg } from './monster-engine'
import { PVP_NPCS, PVP_STAGES } from './pvp-data'

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

  it('never lets a monster that is out of stamina and untrained beat the middle rival', () => {
    for (const stage of PVP_STAGES) {
      const tired = toFighter({
        ...createEgg(EnumMonsterLine.FLAME, NOW),
        speciesId: `flame_${SPECIES[stage]}`,
        stage,
        fullness: 0,
        strength: 0,
        stamina: 0,
        weight: 40,
      })
      const middle = PVP_NPCS.find(npc => npc.stage === stage && npc.rating === 1000)!
      expect(winRate(tired, middle.fighter)).toBeLessThan(0.1)
    }
  })
})
