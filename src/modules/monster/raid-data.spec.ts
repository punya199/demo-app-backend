import { EnumMonsterLine } from '../../db/entities/monster.entity'
import { simulateBattle } from './battle-engine'
import { IFighter, toFighter } from './battle-stats'
import { EnumEquipmentSlot, findSetPieceTemplate, SET_DEFINITIONS } from './equipment-data'
import { createEgg } from './monster-engine'
import {
  EnumRaidDifficulty,
  getRaidBossFighter,
  isStageAtLeast,
  RAID_BOSSES,
  RAID_DIFFICULTIES,
  RAID_EXCHANGE_COST,
  requiredDifficultyForGrade,
} from './raid-data'
import { EnumMonsterStage } from '../../db/entities/monster.entity'

const NOW = new Date('2026-01-01T03:00:00Z')
const LINES = [EnumMonsterLine.FLAME, EnumMonsterLine.TIDE, EnumMonsterLine.LEAF]
const SUFFIX: Record<string, string> = {
  [EnumMonsterStage.ADULT]: 'adultGood',
  [EnumMonsterStage.PERFECT]: 'perfectGood',
  [EnumMonsterStage.ULTIMATE]: 'ultimate',
}

const wellCared = (line: EnumMonsterLine, stage: EnumMonsterStage) =>
  toFighter({
    ...createEgg(line, NOW),
    speciesId: `${line}_${SUFFIX[stage]}`,
    stage,
    fullness: 4,
    strength: 4,
    weight: 40,
  })

const winRate = (player: IFighter, boss: IFighter, fights = 300) => {
  let wins = 0
  for (let seed = 1; seed <= fights; seed++) {
    wins += simulateBattle(player, boss, seed, { ignoreElements: true }).won ? 1 : 0
  }
  return wins / fights
}

describe('raid data', () => {
  it('has three bosses whose sets exist, with every slot as a piece', () => {
    expect(RAID_BOSSES).toHaveLength(3)
    for (const boss of RAID_BOSSES) {
      expect(SET_DEFINITIONS[boss.setId]).toBeDefined()
      for (const slot of Object.values(EnumEquipmentSlot)) {
        expect(findSetPieceTemplate(boss.setId, slot)).toBeDefined()
      }
    }
    expect(new Set(RAID_BOSSES.map(boss => boss.setId)).size).toBe(3)
  })

  it('pays more tokens, a higher grade and a higher price for each harder difficulty', () => {
    const tokens = RAID_DIFFICULTIES.map(entry => entry.raidTokens)
    expect(tokens).toEqual([...tokens].sort((a, b) => a - b))
    expect(requiredDifficultyForGrade(RAID_DIFFICULTIES[0].grade)).toBe(EnumRaidDifficulty.NORMAL)
    expect(requiredDifficultyForGrade(RAID_DIFFICULTIES[2].grade)).toBe(
      EnumRaidDifficulty.NIGHTMARE
    )
    const costs = RAID_DIFFICULTIES.map(entry => RAID_EXCHANGE_COST[entry.grade]!)
    expect(costs).toEqual([...costs].sort((a, b) => a - b))
  })

  it('orders forms', () => {
    expect(isStageAtLeast(EnumMonsterStage.PERFECT, EnumMonsterStage.ADULT)).toBe(true)
    expect(isStageAtLeast(EnumMonsterStage.ADULT, EnumMonsterStage.PERFECT)).toBe(false)
    expect(isStageAtLeast(EnumMonsterStage.ADULT, EnumMonsterStage.ADULT)).toBe(true)
  })
})

describe('raid balance', () => {
  // Raid fights ignore the element triangle (see raid-data.ts); the boss's element is only flavor.
  const raidWinRate = (line: EnumMonsterLine, stage: EnumMonsterStage, difficultyIndex: number) =>
    winRate(
      wellCared(line, stage),
      getRaidBossFighter(RAID_BOSSES[0], RAID_DIFFICULTIES[difficultyIndex])
    )

  // A well-cared monster of the entry form wins roughly 70% / 50% / 30% (no set equipment).
  const targets = [0.7, 0.5, 0.3]
  RAID_DIFFICULTIES.forEach((difficulty, index) => {
    it(`${difficulty.difficulty}: about ${targets[index] * 100}% on average, and no line is locked out`, () => {
      const rates = LINES.map(line => raidWinRate(line, difficulty.minStage, index))
      const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length
      expect(Math.abs(average - targets[index])).toBeLessThan(0.12)
      // every line can collect every boss's set, not just the lines the boss's element favours
      expect(Math.min(...rates)).toBeGreaterThan(0.1)
    })
  })

  it('gives every boss the same strength (the element does not change difficulty)', () => {
    const strengths = RAID_BOSSES.map(boss => getRaidBossFighter(boss, RAID_DIFFICULTIES[0]).stats)
    expect(new Set(strengths.map(stats => JSON.stringify(stats))).size).toBe(1)
  })

  it('gets easier for a stronger form', () => {
    const adult = raidWinRate(EnumMonsterLine.TIDE, EnumMonsterStage.ADULT, 0)
    const ultimate = raidWinRate(EnumMonsterLine.TIDE, EnumMonsterStage.ULTIMATE, 0)
    expect(ultimate).toBeGreaterThan(adult)
  })
})
