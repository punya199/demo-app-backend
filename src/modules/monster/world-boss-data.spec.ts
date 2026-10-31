import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { toFighter } from './battle-stats'
import { EnumEquipmentGrade, EnumEquipmentSlot, SET_DEFINITIONS } from './equipment-data'
import { createEgg } from './monster-engine'
import { WORLD_BOSS_ROUNDS } from './monster-rules'
import { simulateTeamBattle } from './team-battle'
import {
  calcWorldBossReward,
  claimRolls,
  findRankTier,
  getWeek,
  getWorldBossFighter,
  getWorldBossOfWeek,
  WORLD_BOSS_RANK_REWARDS,
  WORLD_BOSS_ROTATION,
} from './world-boss-data'

describe('world boss weeks', () => {
  it('numbers ISO weeks including the year boundaries', () => {
    expect(getWeek(new Date('2026-01-01T05:00:00Z')).key).toBe('2026-W01')
    // Monday 29 Dec 2025 already belongs to ISO week 1 of 2026
    expect(getWeek(new Date('2025-12-29T05:00:00Z')).key).toBe('2026-W01')
    expect(getWeek(new Date('2026-12-31T05:00:00Z')).key).toBe('2026-W53')
    expect(getWeek(new Date('2027-01-03T05:00:00Z')).key).toBe('2026-W53')
    expect(getWeek(new Date('2027-01-04T05:00:00Z')).key).toBe('2027-W01')
  })

  it('rolls over at Monday midnight Thai time', () => {
    // 16:59 UTC Sunday = 23:59 Thai; 17:00 UTC = 00:00 Monday Thai
    expect(getWeek(new Date('2026-05-03T16:59:00Z')).key).toBe('2026-W18')
    expect(getWeek(new Date('2026-05-03T17:00:00Z')).key).toBe('2026-W19')
  })

  it('spans exactly seven days from Monday 00:00 Thai', () => {
    const week = getWeek(new Date('2026-05-06T05:00:00Z'))
    expect(week.startsAt.toISOString()).toBe('2026-05-03T17:00:00.000Z')
    expect(week.endsAt.toISOString()).toBe('2026-05-10T17:00:00.000Z')
  })

  it('picks the boss from the rotation by week and its set exists', () => {
    const boss = getWorldBossOfWeek(getWeek(new Date('2026-05-06T05:00:00Z')))
    expect(WORLD_BOSS_ROTATION).toContain(boss)
    expect(SET_DEFINITIONS[boss.setId]).toBeDefined()
  })
})

describe('world boss rewards', () => {
  const input = { rank: 20, hits: 2, defeated: false, isKillingBlow: false }

  it('pays per hit, plus a rank tier', () => {
    expect(calcWorldBossReward(input, 0.99)).toEqual({
      coin: 100,
      raidToken: 2,
      bossToken: 1,
      pieceGrade: null,
    })
    const first = calcWorldBossReward({ ...input, rank: 1, hits: 3 }, 0.99)
    expect(first).toMatchObject({ coin: 150, raidToken: 3 + 15, bossToken: 6 })
    expect(first.pieceGrade).toBe(EnumEquipmentGrade.EPIC) // rank 1 always gets a piece
  })

  it('rolls the rank tier piece chance', () => {
    expect(calcWorldBossReward({ ...input, rank: 2 }, 0.49).pieceGrade).toBe(
      EnumEquipmentGrade.RARE
    )
    expect(calcWorldBossReward({ ...input, rank: 2 }, 0.5).pieceGrade).toBeNull()
    expect(calcWorldBossReward({ ...input, rank: 20 }, 0).pieceGrade).toBeNull()
  })

  it('adds the defeat bonus and guarantees the killing blow a piece', () => {
    const defeated = calcWorldBossReward({ ...input, defeated: true }, 0.99)
    expect(defeated.coin).toBe(100 + 200)
    expect(defeated.raidToken).toBe(2 + 5)
    const blow = calcWorldBossReward({ ...input, defeated: true, isKillingBlow: true }, 0.99)
    expect(blow.pieceGrade).toBe(EnumEquipmentGrade.EPIC)
  })

  it('has tiers ordered from best to worst, ending with a catch-all', () => {
    const ranks = WORLD_BOSS_RANK_REWARDS.map(tier => tier.maxRank)
    expect(ranks[ranks.length - 1]).toBeNull()
    expect(findRankTier(1)).toBe(WORLD_BOSS_RANK_REWARDS[0])
    expect(findRankTier(4)).toBe(WORLD_BOSS_RANK_REWARDS[2])
    expect(findRankTier(500)).toBe(WORLD_BOSS_RANK_REWARDS[3])
    const raid = WORLD_BOSS_RANK_REWARDS.map(tier => tier.raidToken)
    expect(raid).toEqual([...raid].sort((a, b) => b - a))
  })
})

describe('claim rolls', () => {
  it('are the same every time for the same boss and player, so a retry cannot re-roll', () => {
    expect(claimRolls('boss-1', 'user-1')).toEqual(claimRolls('boss-1', 'user-1'))
    const rolls = claimRolls('boss-1', 'user-1')
    expect(rolls.pieceRoll).toBeGreaterThanOrEqual(0)
    expect(rolls.pieceRoll).toBeLessThan(1)
    expect(Object.values(EnumEquipmentSlot)).toContain(rolls.slot)
  })

  it('differ between players', () => {
    const all = new Set(
      Array.from({ length: 40 }, (_, index) => claimRolls('boss-1', `user-${index}`).pieceRoll)
    )
    expect(all.size).toBeGreaterThan(30)
  })
})

describe('world boss balance', () => {
  const NOW = new Date('2026-01-01T03:00:00Z')
  const SUFFIX: Record<string, string> = {
    [EnumMonsterStage.ADULT]: 'adultGood',
    [EnumMonsterStage.PERFECT]: 'perfectGood',
    [EnumMonsterStage.ULTIMATE]: 'ultimate',
  }
  const LINES = [EnumMonsterLine.FLAME, EnumMonsterLine.TIDE, EnumMonsterLine.LEAF]

  // Average damage of one hit by a well-cared monster of the form, over the three lines.
  const averageHit = (stage: EnumMonsterStage) => {
    const boss = WORLD_BOSS_ROTATION[0]
    let total = 0
    let fights = 0
    for (const line of LINES) {
      const fighter = toFighter({
        ...createEgg(line, NOW),
        speciesId: `${line}_${SUFFIX[stage]}`,
        stage,
        fullness: 4,
        strength: 4,
        weight: 40,
      })
      for (let seed = 1; seed <= 100; seed++) {
        const hp = boss.hp
        total += simulateTeamBattle(
          [fighter],
          getWorldBossFighter(boss, hp),
          seed,
          WORLD_BOSS_ROUNDS
        ).damageDealt
        fights += 1
      }
    }
    return total / fights
  }

  it('deals more damage with a stronger form', () => {
    const adult = averageHit(EnumMonsterStage.ADULT)
    const perfect = averageHit(EnumMonsterStage.PERFECT)
    const ultimate = averageHit(EnumMonsterStage.ULTIMATE)
    expect(adult).toBeGreaterThan(10)
    expect(perfect).toBeGreaterThan(adult * 2)
    expect(ultimate).toBeGreaterThan(perfect * 1.5)
  })

  it('takes several strong players a whole week to defeat, not one day and not impossible', () => {
    const hp = WORLD_BOSS_ROTATION[0].hp
    const hit = averageHit(EnumMonsterStage.ULTIMATE)
    const hitsPerWeek = 3 * 7
    // One ultimate player alone can't do it; a handful of them can inside the week.
    expect(hit * hitsPerWeek).toBeLessThan(hp)
    expect(hit * hitsPerWeek * 5).toBeGreaterThan(hp)
    // Nobody can empty it in a single day.
    expect(hit * 3 * 10).toBeLessThan(hp)
  })
})
