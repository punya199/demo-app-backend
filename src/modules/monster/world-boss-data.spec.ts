import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { toFighter } from './battle-stats'
import {
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  EnumMaterialId,
  SET_DEFINITIONS,
} from './equipment-data'
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
  IWorldBoss,
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
      refineStones: {},
    })
    const first = calcWorldBossReward({ ...input, rank: 1, hits: 3 }, 0.99)
    expect(first).toMatchObject({ coin: 150, raidToken: 3 + 15, bossToken: 6 })
    expect(first.pieceGrade).toBe(EnumEquipmentGrade.EPIC) // rank 1 always gets a piece
  })

  it('pays epic and legendary refine stones by rank, and one more epic for the killing blow', () => {
    const stones = (overrides: Partial<typeof input>) =>
      calcWorldBossReward({ ...input, ...overrides }, 0.99).refineStones
    expect(stones({ rank: 1 })).toEqual({
      [EnumMaterialId.REFINE_EPIC]: 2,
      [EnumMaterialId.REFINE_LEGENDARY]: 1,
    })
    expect(stones({ rank: 3 })).toEqual({ [EnumMaterialId.REFINE_EPIC]: 2 })
    expect(stones({ rank: 10 })).toEqual({ [EnumMaterialId.REFINE_EPIC]: 1 })
    expect(stones({ rank: 11 })).toEqual({})
    expect(stones({ rank: 11, isKillingBlow: true })).toEqual({ [EnumMaterialId.REFINE_EPIC]: 1 })
    expect(stones({ rank: 1, isKillingBlow: true })[EnumMaterialId.REFINE_EPIC]).toBe(3)
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
    const first = claimRolls('boss-1', 'user-1')
    const second = claimRolls('boss-1', 'user-1')
    expect([first.pieceRoll, first.slot, first.rng(), first.rng()]).toEqual([
      second.pieceRoll,
      second.slot,
      second.rng(),
      second.rng(),
    ])
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
  // `gear` scales every stat (equipment and passives); `elements` turns the triangle on, as the
  // World Boss service does.
  const averageHit = (
    stage: EnumMonsterStage,
    boss = WORLD_BOSS_ROTATION[0],
    gear = 1,
    elements = false
  ) => {
    let total = 0
    let fights = 0
    for (const line of LINES) {
      const base = toFighter({
        ...createEgg(line, NOW),
        speciesId: `${line}_${SUFFIX[stage]}`,
        stage,
        fullness: 4,
        strength: 4,
        weight: 40,
      })
      const fighter = {
        ...base,
        stats: {
          hp: base.stats.hp * gear,
          atk: base.stats.atk * gear,
          def: base.stats.def * gear,
          spd: base.stats.spd * gear,
        },
      }
      for (let seed = 1; seed <= 100; seed++) {
        total += simulateTeamBattle(
          [fighter],
          getWorldBossFighter(boss, boss.hp),
          seed,
          WORLD_BOSS_ROUNDS,
          { ignoreElements: !elements }
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

  // Design: 10 top players (ultimate form, +30% stats from gear), two sessions a day. A session is
  // WORLD_BOSS_HITS hits, so 6 hits a day each (the cap is 3 hits per 3 hours, 24 a day).
  const TOP_PLAYERS = 10
  const HITS_PER_DAY = 6
  it.each(WORLD_BOSS_ROTATION.map(boss => [boss.id, boss] as const))(
    '%s dies in 3-5 days to ten top players',
    (_id, boss) => {
      const perDay =
        averageHit(EnumMonsterStage.ULTIMATE, boss, 1.3, true) * TOP_PLAYERS * HITS_PER_DAY
      expect(boss.hp / perDay).toBeGreaterThanOrEqual(3)
      expect(boss.hp / perDay).toBeLessThanOrEqual(5)
    }
  )

  it('is not defeated by one ultimate player alone in a week, even at the hit cap', () => {
    for (const boss of WORLD_BOSS_ROTATION) {
      const hit = averageHit(EnumMonsterStage.ULTIMATE, boss, 1.3, true)
      expect(hit * 24 * 7).toBeLessThan(boss.hp)
    }
  })
})

describe('world boss rotation', () => {
  it('has one boss per equipment set, with unique ids', () => {
    const sets = WORLD_BOSS_ROTATION.map(boss => boss.setId)
    expect(new Set(sets).size).toBe(sets.length)
    expect(new Set(sets)).toEqual(new Set(Object.keys(SET_DEFINITIONS)))
    expect(new Set(WORLD_BOSS_ROTATION.map(boss => boss.id)).size).toBe(WORLD_BOSS_ROTATION.length)
  })

  it('picks the same boss for the same week, and every boss turns up over a year', () => {
    const picks = Array.from({ length: 52 }, (_, index) =>
      getWorldBossOfWeek(getWeek(new Date(Date.UTC(2026, 0, 5 + index * 7, 5))))
    )
    expect(picks).toEqual(
      Array.from({ length: 52 }, (_, index) =>
        getWorldBossOfWeek(getWeek(new Date(Date.UTC(2026, 0, 5 + index * 7, 5))))
      )
    )
    expect(new Set(picks).size).toBe(WORLD_BOSS_ROTATION.length)
  })
})

describe('world boss mechanics', () => {
  const hero = () =>
    toFighter({
      ...createEgg(EnumMonsterLine.FLAME, new Date('2026-01-01T03:00:00Z')),
      speciesId: 'flame_ultimate',
      stage: EnumMonsterStage.ULTIMATE,
      fullness: 4,
      strength: 4,
      weight: 40,
    })
  const plain: IWorldBoss = { ...WORLD_BOSS_ROTATION[0], enrage: undefined, shield: undefined }

  it('gives no mods to a boss without a shield or enrage', () => {
    expect(getWorldBossFighter(plain, 1000).bossMods).toBeUndefined()
  })

  it('a shield eats the first damage of every fight without touching the shared HP', () => {
    const shielded = { ...plain, shield: 200 }
    const without = simulateTeamBattle([hero()], getWorldBossFighter(plain, 100_000), 7, 10)
    const withShield = simulateTeamBattle([hero()], getWorldBossFighter(shielded, 100_000), 7, 10)
    expect(withShield.damageDealt).toBeLessThan(without.damageDealt)
    expect(without.damageDealt - withShield.damageDealt).toBeLessThanOrEqual(200)
    expect(withShield.events.some(event => (event.absorbed ?? 0) > 0)).toBe(true)
  })

  it('enrage raises the boss hits from its round and not before', () => {
    const enraged = { ...plain, enrage: { round: 4, mult: 3 } }
    const bossHits = (boss: IWorldBoss) =>
      simulateTeamBattle([hero()], getWorldBossFighter(boss, 100_000), 11, 10).events.filter(
        event =>
          event.actor === 'enemy' && !event.isDodged && !event.isSkill && event.kind === undefined
      )
    const calm = bossHits(plain)
    const angry = bossHits(enraged)
    const before = (hits: typeof calm) => hits.filter(hit => hit.round < 4).map(hit => hit.damage)
    expect(before(angry)).toEqual(before(calm))
    const after = (hits: typeof calm) => hits.filter(hit => hit.round >= 4).map(hit => hit.damage)
    expect(Math.max(...after(angry))).toBeGreaterThan(Math.max(...after(calm)))
  })
})
