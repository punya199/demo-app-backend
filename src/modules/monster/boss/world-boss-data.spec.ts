import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { ARENA_SKILL_BY_ID, simulateArena } from '../arena/arena-engine'
import { ARENA_H, ARENA_W } from '../arena/arena-rules'
import { wellCaredArenaFighter } from '../arena/arena-test-helpers'
import { isCraftSetId } from '../equipment/craft-sets'
import {
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  EnumMaterialId,
  SET_DEFINITIONS,
} from '../equipment/equipment-data'
import {
  calcWorldBossReward,
  claimRolls,
  findRankTier,
  getWeek,
  getWorldBossArena,
  getWorldBossOfWeek,
  IWorldBoss,
  WORLD_BOSS_RANK_REWARDS,
  splitWorldBossDamage,
  WORLD_BOSS_ARENA_HP_SCALE,
  WORLD_BOSS_ROTATION,
} from './world-boss-data'

describe('the world boss in the arena', () => {
  it('adds the damage up to exactly the HP the boss loses', () => {
    const scale = WORLD_BOSS_ARENA_HP_SCALE
    expect(splitWorldBossDamage(1000, [100 * scale, 50 * scale], false)).toEqual({
      own: 100,
      ally: 50,
      hpAfter: 850,
    })
    // Killed: rounding never leaves HP behind, and the killer takes what is left.
    expect(splitWorldBossDamage(1000, [900 * scale, 80 * scale], true)).toEqual({
      own: 920,
      ally: 80,
      hpAfter: 0,
    })
    // Alive: rounding up never empties the pool without a kill.
    expect(splitWorldBossDamage(100, [100 * scale, 20 * scale], false)).toEqual({
      own: 99,
      ally: 0,
      hpAfter: 1,
    })
  })
})

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
  const LINES = [EnumMonsterLine.FLAME, EnumMonsterLine.TIDE, EnumMonsterLine.LEAF]
  const POOL = 3_000_000

  // Average week HP one hit takes, over the three lines. `gear` scales every stat.
  const averageHit = (stage: EnumMonsterStage, boss: IWorldBoss, gear = 1) => {
    let total = 0
    let fights = 0
    for (const line of LINES) {
      const base = wellCaredArenaFighter(line, stage)
      const me = {
        ...base,
        hp: base.hp * gear,
        atk: Math.round(base.atk * gear),
        def: Math.round(base.def * gear),
        spd: Math.round(base.spd * gear),
      }
      for (let seed = 1; seed <= 15; seed++) {
        const result = simulateArena([[me], [getWorldBossArena(boss, POOL)]], seed)
        total += splitWorldBossDamage(POOL, [result.fighters[0].dealt], false).own
        fights += 1
      }
    }
    return total / fights
  }
  const each = WORLD_BOSS_ROTATION.map(boss => [boss.id, boss] as const)

  it.each(each)('%s lets every form help, stronger forms more', (_id, boss) => {
    const adult = averageHit(EnumMonsterStage.ADULT, boss)
    const perfect = averageHit(EnumMonsterStage.PERFECT, boss)
    // Adults only scratch the boss now (its DEF is high), but they still deal something.
    expect(adult).toBeGreaterThan(0)
    expect(perfect).toBeGreaterThan(adult * 2)
    expect(averageHit(EnumMonsterStage.ULTIMATE, boss)).toBeGreaterThan(perfect * 1.5)
  })

  // The top player's pet, from a real one (A grade, ultimate, full gear and tree). The simulated pet
  // runs a little weaker than the real one on the training dummy (8.5k against 13.6k damage in a
  // minute), so its hit is scaled by this to match.
  const TOP_PET = {
    hp: 307,
    atk: 119,
    def: 57,
    spd: 48,
    eva: 2,
    crit: 31,
    passive: { critDamage: 105 },
  }
  const TOP_PET_DAMAGE_CAL = 1.6
  const topPetHit = (boss: IWorldBoss) => {
    let total = 0
    const seeds = 15
    for (let seed = 1; seed <= seeds; seed++) {
      const me = {
        ...wellCaredArenaFighter(EnumMonsterLine.FLAME, EnumMonsterStage.ULTIMATE),
        ...TOP_PET,
      }
      const result = simulateArena([[me], [getWorldBossArena(boss, POOL)]], seed)
      total += splitWorldBossDamage(POOL, [result.fighters[0].dealt], false).own
    }
    return (total / seeds) * TOP_PET_DAMAGE_CAL
  }

  // Design: 10 top players, two sessions a day. A session is WORLD_BOSS_HITS hits, so 6 hits a day
  // each (the cap is 3 hits per 3 hours, 24 a day).
  it.each(each)('%s dies in 6-7 days to ten top players', (_id, boss) => {
    const days = boss.hp / (topPetHit(boss) * 10 * 6)
    expect(days).toBeGreaterThanOrEqual(6)
    expect(days).toBeLessThanOrEqual(7)
  })

  it.each(each)('%s outlasts one top player alone for a week', (_id, boss) => {
    expect(topPetHit(boss) * 24 * 7).toBeLessThan(boss.hp)
  })
})

describe('world boss rotation', () => {
  it('has one boss per equipment set, with unique ids and abilities', () => {
    const sets = WORLD_BOSS_ROTATION.map(boss => boss.setId)
    expect(new Set(sets).size).toBe(sets.length)
    expect(new Set(sets)).toEqual(
      new Set(Object.keys(SET_DEFINITIONS).filter(setId => !isCraftSetId(setId)))
    )
    expect(new Set(WORLD_BOSS_ROTATION.map(boss => boss.id)).size).toBe(WORLD_BOSS_ROTATION.length)
    expect(new Set(WORLD_BOSS_ROTATION.map(boss => boss.ability)).size).toBe(
      WORLD_BOSS_ROTATION.length
    )
  })

  it('brings the bosses out one by one in order, across a new year, then starts over', () => {
    const weekOf = (index: number) => getWeek(new Date(Date.UTC(2026, 10, 4 + index * 7, 5)))
    const size = WORLD_BOSS_ROTATION.length
    expect(getWorldBossOfWeek(weekOf(0)).id).toBe(WORLD_BOSS_ROTATION[0].id)
    for (let index = 0; index < size * 3; index++) {
      expect(getWorldBossOfWeek(weekOf(index))).toBe(WORLD_BOSS_ROTATION[index % size])
    }
    expect(WORLD_BOSS_ROTATION).toContain(getWorldBossOfWeek(weekOf(-3)))
  })
})

describe('world boss mechanics', () => {
  const hero = () => wellCaredArenaFighter(EnumMonsterLine.FLAME, EnumMonsterStage.ULTIMATE)
  const plain: IWorldBoss = {
    ...WORLD_BOSS_ROTATION[0],
    enrage: undefined,
    shield: undefined,
    arenaPassive: undefined,
  }
  const fight = (boss: IWorldBoss) =>
    simulateArena([[hero()], [getWorldBossArena(boss, 100_000)]], 7, { record: true })

  it('starts each fight behind its shield', () => {
    expect(fight({ ...plain, shield: 30 }).frames[0].f[1][8]).toBe(
      Math.round(30 * WORLD_BOSS_ARENA_HP_SCALE)
    )
    expect(fight(plain).frames[0].f[1][8]).toBe(0)
  })

  it('enrages at its second and not before', () => {
    const enraged = fight({ ...plain, enrage: { sec: 5, mult: 3 } })
    const rage = enraged.events.find(event => event.kind === 'rage')
    expect(rage?.t).toBe(5 * 20)
    expect(fight(plain).events.some(event => event.kind === 'rage')).toBe(false)
  })

  it('grows stronger at 20 and 40 seconds, and not before', () => {
    // A hero that outlives the minute, so the fight reaches both stages.
    const grown = simulateArena(
      [[{ ...hero(), hp: 1_000_000 }], [getWorldBossArena(plain, 100_000)]],
      7,
      { record: true }
    )
    const stages = grown.events.filter(event => event.kind === 'grow')
    expect(stages.map(event => event.t)).toEqual([20 * 20, 40 * 20])
    expect(getWorldBossArena(plain, 1000).passive?.grow).toEqual({
      secs: [20, 40],
      atk: 30,
      def: 30,
    })
  })

  it('has a third skill that lands on the whole arena', () => {
    for (const boss of WORLD_BOSS_ROTATION) {
      const skill = ARENA_SKILL_BY_ID[boss.arenaSkills[2]]
      expect(skill?.kind).toBe('zone')
      expect(skill.radius).toBeGreaterThan(Math.hypot(ARENA_W, ARENA_H))
    }
  })

  it('keeps the element triangle', () => {
    expect(getWorldBossArena(plain, 1000).usesElements).toBe(true)
  })
})
