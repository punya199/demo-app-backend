import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
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
  // Flat shield every hit has to chew through first (not shared; each fight starts fresh).
  shield?: number
  // From `round` on, the boss's attack is multiplied by `mult` within each fight.
  enrage?: { round: number; mult: number }
}

// Rotation by week: getWorldBossOfWeek picks one at random (seeded by the week, so every player
// sees the same boss). One boss per equipment set, so the exchange shop covers every set.
// HP is tuned in world-boss-data.spec.ts so ten strong players kill each in 3-5 days.
export const WORLD_BOSS_ROTATION: IWorldBoss[] = [
  {
    id: 'storm_golem',
    name: 'จักรกลพายุ',
    emoji: '⚡',
    setId: 'swift_thunder',
    element: EnumMonsterLine.LIGHTNING,
    hp: 111_000,
    skillName: 'พายุสายฟ้า',
    enrage: { round: 6, mult: 1.5 },
  },
  {
    id: 'flame_dragon',
    name: 'มังกรเพลิงกัลป์',
    emoji: '🔥',
    setId: 'blazing',
    element: EnumMonsterLine.FLAME,
    hp: 114_000,
    skillName: 'ลมหายใจเพลิง',
    strength: 1.1,
    enrage: { round: 5, mult: 1.5 },
  },
  {
    id: 'tide_tortoise',
    name: 'เต่ายักษ์วารี',
    emoji: '🌊',
    setId: 'tidal_guard',
    element: EnumMonsterLine.TIDE,
    hp: 98_000,
    skillName: 'คลื่นยักษ์',
    shield: 120,
  },
  {
    id: 'ancient_tree',
    name: 'ต้นไม้โบราณ',
    emoji: '🌳',
    setId: 'deep_root',
    element: EnumMonsterLine.EARTH,
    hp: 107_000,
    skillName: 'รากพันธนาการ',
    shield: 150,
  },
  {
    id: 'radiant_angel',
    name: 'เทวทูตรัศมี',
    emoji: '✨',
    setId: 'radiant',
    element: EnumMonsterLine.HOLY,
    hp: 126_000,
    skillName: 'แสงชำระ',
    skillPower: 1.1,
  },
  {
    id: 'night_lord',
    name: 'จอมราตรี',
    emoji: '🌑',
    setId: 'nightfall',
    element: EnumMonsterLine.DARK,
    hp: 106_000,
    skillName: 'ราตรีกาล',
    shield: 80,
    enrage: { round: 7, mult: 1.4 },
  },
  {
    id: 'shadow_king',
    name: 'ราชาม่านเงา',
    emoji: '👻',
    setId: 'shadow_veil',
    element: EnumMonsterLine.SHADOW,
    hp: 102_000,
    skillName: 'ม่านมายา',
    shield: 100,
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
  ...((boss.shield || boss.enrage) && { bossMods: { shield: boss.shield, enrage: boss.enrage } }),
})

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

export interface IWeek {
  // ISO week in Thai time, e.g. 2026-W19
  key: string
  startsAt: Date
  endsAt: Date
  // Stable number for choosing a boss from the rotation.
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
    index: isoYear * 53 + week,
  }
}

// Random but the same for everyone: the week key is the seed. The same boss can come twice in a row.
export const getWorldBossOfWeek = (week: IWeek) =>
  WORLD_BOSS_ROTATION[fnv1a(week.key) % WORLD_BOSS_ROTATION.length]

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
  return { pieceRoll, slot: slots[Math.floor(rng() * slots.length)], rng }
}
