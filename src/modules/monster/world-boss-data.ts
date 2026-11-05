import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { arenaBossSpec } from './arena/arena-fighter'
import { ARENA_HP_SCALE } from './arena/arena-rules'
import { IArenaFighterSpec, IArenaPassive } from './arena/arena-types'
import { createRng } from './battle-engine'
import { IFighter } from './battle-stats'
import { EnumEquipmentGrade, EnumEquipmentSlot, EnumMaterialId } from './equipment-data'
import { scaleStats, STAGE_BASE_STATS } from './species-data'

// One world boss per Thai ISO week, shared by every player: they all chip away at one HP pool.
// The week row is created by the first request of the week (no job).

export interface IWorldBoss {
  id: string
  name: string
  emoji: string
  setId: string
  // Real element: World Boss fights use the element triangle both ways.
  element: EnumMonsterLine
  // Total HP for the week, shared by all players.
  hp: number
  skillName: string
  // Multipliers on WORLD_BOSS_STRENGTH / WORLD_BOSS_SKILL_POWER; default 1.
  strength?: number
  skillPower?: number
  // Flat shield the player has to chew through first, in week HP (not shared; each fight starts fresh).
  shield?: number
  // From `sec` on, the boss's attack is multiplied by `mult` within each fight.
  enrage?: { sec: number; mult: number }
  // What sets it apart, as shown to the player.
  ability: string
  // Its two skills, and its own passives and dodge, in the arena.
  arenaSkills: [string, string]
  arenaPassive?: IArenaPassive
  arenaDodge?: string
}

// One boss a week, in this order, starting over after the last. One boss per equipment set, so the
// exchange shop covers every set. HP is tuned in world-boss-data.spec.ts so ten strong players kill
// each in 3-5 days. Abilities are never a share of max HP: the pool is far bigger than a pet's HP.
export const WORLD_BOSS_ROTATION: IWorldBoss[] = [
  {
    id: 'storm_golem',
    name: 'จักรกลพายุ',
    emoji: '⚡',
    setId: 'swift_thunder',
    element: EnumMonsterLine.LIGHTNING,
    hp: 128_000,
    skillName: 'พายุสายฟ้า',
    ability: 'โจมตีเร็ว',
    arenaSkills: ['e_sparktail', 'e_thunderdive'],
    arenaPassive: { attackSpeed: 20 },
    enrage: { sec: 36, mult: 1.5 },
  },
  {
    id: 'flame_dragon',
    name: 'มังกรเพลิงกัลป์',
    emoji: '🔥',
    setId: 'blazing',
    element: EnumMonsterLine.FLAME,
    hp: 129_000,
    skillName: 'ลมหายใจเพลิง',
    ability: 'ตีธรรมดาติดเผาไหม้',
    arenaSkills: ['e_volcano', 'e_dragontail'],
    arenaPassive: { onBasic: { st: 'burn', dur: 4, ch: 50 } },
    strength: 1.1,
    enrage: { sec: 30, mult: 1.5 },
  },
  {
    id: 'tide_tortoise',
    name: 'เต่ายักษ์วารี',
    emoji: '🌊',
    setId: 'tidal_guard',
    element: EnumMonsterLine.TIDE,
    hp: 136_000,
    skillName: 'คลื่นยักษ์',
    ability: 'ลดดาเมจที่ได้รับ',
    arenaSkills: ['e_whirlpool', 'e_shellram'],
    arenaPassive: { damageCut: 15 },
    shield: 30,
  },
  {
    id: 'ancient_tree',
    name: 'ต้นไม้โบราณ',
    emoji: '🌳',
    setId: 'deep_root',
    element: EnumMonsterLine.EARTH,
    hp: 150_000,
    skillName: 'รากพันธนาการ',
    ability: 'สะท้อนดาเมจกลับ',
    arenaSkills: ['e_crystalburst', 'e_rockcharge'],
    arenaPassive: { thorns: 15 },
    shield: 40,
  },
  {
    id: 'radiant_angel',
    name: 'เทวทูตรัศมี',
    emoji: '✨',
    setId: 'radiant',
    element: EnumMonsterLine.HOLY,
    hp: 157_000,
    skillName: 'แสงชำระ',
    ability: 'ตีธรรมดาทำให้ใบ้ ใช้สกิลไม่ได้',
    arenaSkills: ['e_fan', 'e_plumes'],
    arenaPassive: { onBasic: { st: 'silence', dur: 2, ch: 35 } },
    skillPower: 1.1,
  },
  {
    id: 'night_lord',
    name: 'จอมราตรี',
    emoji: '🌑',
    setId: 'nightfall',
    element: EnumMonsterLine.DARK,
    hp: 166_000,
    skillName: 'ราตรีกาล',
    ability: 'ตีธรรมดาลดเกราะเป้าหมาย',
    arenaSkills: ['e_orebite', 'e_cliffram'],
    arenaPassive: { onBasic: { st: 'defDown', dur: 3, ch: 40 } },
    shield: 20,
    enrage: { sec: 42, mult: 1.4 },
  },
  {
    id: 'shadow_king',
    name: 'ราชาม่านเงา',
    emoji: '👻',
    setId: 'shadow_veil',
    element: EnumMonsterLine.SHADOW,
    hp: 164_000,
    skillName: 'ม่านมายา',
    ability: 'หลบเก่งและหายตัวได้',
    arenaSkills: ['e_stormclaw', 'e_mistbite'],
    arenaPassive: { eva: 25 },
    arenaDodge: 'dg_vanish',
    shield: 25,
  },
]

// Stat multiplier on the ultimate form's base stats, tuned (world-boss-data.spec.ts) so a hit from
// a well-cared perfect form deals a few hundred and an ultimate form can take most of the 10
// rounds, while adults still contribute a little.
export const WORLD_BOSS_STRENGTH = 0.8
export const WORLD_BOSS_SKILL_POWER = 1.8

export const findWorldBoss = (bossId: string) =>
  WORLD_BOSS_ROTATION.find(boss => boss.id === bossId)

// The boss as a fighter with `hp` left.
export const getWorldBossFighter = (boss: IWorldBoss, hp: number): IFighter => ({
  name: boss.name,
  emoji: boss.emoji,
  element: boss.element,
  stats: {
    ...scaleStats(
      STAGE_BASE_STATS[EnumMonsterStage.ULTIMATE],
      WORLD_BOSS_STRENGTH * (boss.strength ?? 1)
    ),
    hp,
  },
  skill: { name: boss.skillName, power: WORLD_BOSS_SKILL_POWER * (boss.skillPower ?? 1) },
})

// A fight lasts up to a minute in the arena and deals about this many times what the old ten rounds
// did at every form, so one point of the week's HP is this much arena HP.
export const WORLD_BOSS_ARENA_HP_SCALE = 2.4

// World bosses keep the element triangle (raid bosses ignore it).
export const getWorldBossArena = (boss: IWorldBoss, hp: number): IArenaFighterSpec => ({
  ...arenaBossSpec(getWorldBossFighter(boss, hp), boss.arenaSkills),
  hp: (hp * WORLD_BOSS_ARENA_HP_SCALE) / ARENA_HP_SCALE,
  usesElements: true,
  dodge: boss.arenaDodge ?? null,
  passive: {
    ...boss.arenaPassive,
    ...(boss.shield && { flatShield: Math.round(boss.shield * WORLD_BOSS_ARENA_HP_SCALE) }),
    ...(boss.enrage && {
      rage: { sec: boss.enrage.sec, atk: Math.round((boss.enrage.mult - 1) * 100) },
    }),
  },
})

// Arena damage back in the week's HP. It always adds up to the HP the boss really loses: all of it
// when the fight killed the boss, and never all of it when it did not.
export const splitWorldBossDamage = (hp: number, dealt: number[], isDefeated: boolean) => {
  const toPool = (damage = 0) => Math.round(damage / WORLD_BOSS_ARENA_HP_SCALE)
  const limit = isDefeated ? hp : hp - 1
  const own = Math.min(limit, toPool(dealt[0]))
  const ally = Math.min(limit - own, toPool(dealt[1]))
  return {
    own: isDefeated ? hp - ally : own,
    ally,
    hpAfter: isDefeated ? 0 : hp - own - ally,
  }
}

// 32-bit FNV-1a, enough to turn an id into a seed.
const fnv1a = (text: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
  }
  return hash >>> 0
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
// Monday 00:00 Thai of 2026-W45, the first boss's week.
const ROTATION_START = Date.UTC(2026, 10, 1, 17)

export interface IWeek {
  // ISO week in Thai time, e.g. 2026-W19
  key: string
  startsAt: Date
  endsAt: Date
  // Weeks since the rotation started (below 0 before it): one more every week, across new years too.
  index: number
}

// ISO 8601 week (Monday start) of the Thai calendar day containing `now`.
export const getWeek = (now: Date): IWeek => {
  const local = new Date(now.getTime() + BANGKOK_OFFSET_MS)
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const sinceMonday = (new Date(localMidnight).getUTCDay() + 6) % 7
  const monday = localMidnight - sinceMonday * DAY_MS
  const thursday = monday + 3 * DAY_MS
  const isoYear = new Date(thursday).getUTCFullYear()
  const jan4 = Date.UTC(isoYear, 0, 4)
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS
  const week = Math.round((monday - week1Monday) / (7 * DAY_MS)) + 1
  const startsAt = new Date(monday - BANGKOK_OFFSET_MS)
  return {
    key: `${isoYear}-W${String(week).padStart(2, '0')}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 7 * DAY_MS),
    index: Math.round((startsAt.getTime() - ROTATION_START) / (7 * DAY_MS)),
  }
}

// Next in line every week. Modulo that stays in range for weeks before the rotation started.
export const getWorldBossOfWeek = (week: IWeek) => {
  const size = WORLD_BOSS_ROTATION.length
  return WORLD_BOSS_ROTATION[((week.index % size) + size) % size]
}

export const WORLD_BOSS_PARTICIPATION_PER_HIT = { coin: 50, raidToken: 1 }
// Everyone who took part, when the boss is defeated before the week ends.
export const WORLD_BOSS_DEFEATED_BONUS = { coin: 200, raidToken: 5 }
export const WORLD_BOSS_KILLING_BLOW_GRADE = EnumEquipmentGrade.EPIC

export type RefineStones = Partial<Record<EnumMaterialId, number>>

export interface IWorldBossRankTier {
  // Best damage rank that gets this tier (inclusive); null = everyone else who took part.
  maxRank: number | null
  raidToken: number
  bossToken: number
  // Chance (0-1) of one piece of the boss's set at pieceGrade.
  pieceChance: number
  pieceGrade: EnumEquipmentGrade
  // Refine stones paid to everyone in this tier.
  refineStones: RefineStones
}

export const WORLD_BOSS_RANK_REWARDS: IWorldBossRankTier[] = [
  {
    maxRank: 1,
    raidToken: 15,
    bossToken: 6,
    pieceChance: 1,
    pieceGrade: EnumEquipmentGrade.EPIC,
    refineStones: { [EnumMaterialId.REFINE_EPIC]: 2, [EnumMaterialId.REFINE_LEGENDARY]: 1 },
  },
  {
    maxRank: 3,
    raidToken: 10,
    bossToken: 4,
    pieceChance: 0.5,
    pieceGrade: EnumEquipmentGrade.RARE,
    refineStones: { [EnumMaterialId.REFINE_EPIC]: 2 },
  },
  {
    maxRank: 10,
    raidToken: 5,
    bossToken: 2,
    pieceChance: 0.25,
    pieceGrade: EnumEquipmentGrade.RARE,
    refineStones: { [EnumMaterialId.REFINE_EPIC]: 1 },
  },
  {
    maxRank: null,
    raidToken: 0,
    bossToken: 1,
    pieceChance: 0,
    pieceGrade: EnumEquipmentGrade.RARE,
    refineStones: {},
  },
]

export const findRankTier = (rank: number) =>
  WORLD_BOSS_RANK_REWARDS.find(tier => tier.maxRank === null || rank <= tier.maxRank)!

export interface IWorldBossRewardInput {
  rank: number
  hits: number
  defeated: boolean
  isKillingBlow: boolean
}

export interface IWorldBossReward {
  coin: number
  raidToken: number
  bossToken: number
  // The set piece won, if any (grade only; the slot is picked by the caller).
  pieceGrade: EnumEquipmentGrade | null
  refineStones: RefineStones
}

// What a week's participation pays. `pieceRoll` in [0, 1) decides the rank tier's piece chance, so
// the caller can make it reproducible (see claimRolls).
export const calcWorldBossReward = (
  input: IWorldBossRewardInput,
  pieceRoll: number
): IWorldBossReward => {
  const tier = findRankTier(input.rank)
  const bonus = input.defeated ? WORLD_BOSS_DEFEATED_BONUS : { coin: 0, raidToken: 0 }
  let pieceGrade: EnumEquipmentGrade | null = pieceRoll < tier.pieceChance ? tier.pieceGrade : null
  if (input.isKillingBlow) {
    // The finishing hit is guaranteed a piece (the better grade if the rank tier gave one too).
    pieceGrade = pieceGrade === EnumEquipmentGrade.EPIC ? pieceGrade : WORLD_BOSS_KILLING_BLOW_GRADE
  }
  return {
    coin: input.hits * WORLD_BOSS_PARTICIPATION_PER_HIT.coin + bonus.coin,
    raidToken:
      input.hits * WORLD_BOSS_PARTICIPATION_PER_HIT.raidToken + bonus.raidToken + tier.raidToken,
    bossToken: tier.bossToken,
    pieceGrade,
    // The finishing hit also earns one more epic stone.
    refineStones: input.isKillingBlow
      ? {
          ...tier.refineStones,
          [EnumMaterialId.REFINE_EPIC]: (tier.refineStones[EnumMaterialId.REFINE_EPIC] ?? 0) + 1,
        }
      : tier.refineStones,
  }
}

// The random rolls of one player's claim for one boss. Derived from ids, not from the clock, so
// retrying a claim (for example after clearing bag space) can never re-roll a better piece.
export const claimRolls = (worldBossId: string, userId: string) => {
  const rng = createRng(fnv1a(`${worldBossId}:${userId}`))
  const pieceRoll = rng()
  const slots = Object.values(EnumEquipmentSlot)
  // `rng` carries on for the piece's own stat rolls, so those are fixed per claim too.
  // The craft unique's kind has its own stream, so the piece rolls above stay exactly as they were.
  const craftKindRoll = createRng(fnv1a(`${worldBossId}:${userId}:craft`))()
  return { pieceRoll, slot: slots[Math.floor(rng() * slots.length)], rng, craftKindRoll }
}
