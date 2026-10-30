import { EnumMonsterLine } from '../../db/entities/monster.entity'
import { IFighter } from './battle-stats'

// Deterministic auto-battle: the same fighters and seed always replay the same fight, so the
// server can decide results and the client only animates the returned events.

export const MAX_ROUNDS = 20
// Every SKILL_EVERY_ROUNDS-th round a fighter uses its skill instead of a basic attack.
export const SKILL_EVERY_ROUNDS = 3
export const CRITICAL_CHANCE = 0.15
export const CRITICAL_MULTIPLIER = 1.5
export const STRONG_MULTIPLIER = 1.3
export const WEAK_MULTIPLIER = 0.8
export const DEFENSE_FACTOR = 0.5
// Each hit lands between (1 - DAMAGE_VARIANCE) and (1 + DAMAGE_VARIANCE) of its base damage.
export const DAMAGE_VARIANCE = 0.15

export type BattleSide = 'player' | 'enemy'
export type Effectiveness = 'strong' | 'weak' | 'normal'

export interface IBattleEvent {
  round: number
  actor: BattleSide
  moveName: string
  isSkill: boolean
  damage: number
  isCritical: boolean
  effectiveness: Effectiveness
  targetHp: number
}

export interface IBattleResult {
  won: boolean
  rounds: number
  events: IBattleEvent[]
}

// Each element beats the next one: flame burns leaf, leaf drinks tide, tide douses flame.
const BEATS: Record<EnumMonsterLine, EnumMonsterLine> = {
  [EnumMonsterLine.FLAME]: EnumMonsterLine.LEAF,
  [EnumMonsterLine.LEAF]: EnumMonsterLine.TIDE,
  [EnumMonsterLine.TIDE]: EnumMonsterLine.FLAME,
}

export const getEffectiveness = (
  attacker: EnumMonsterLine,
  defender: EnumMonsterLine
): Effectiveness => {
  if (BEATS[attacker] === defender) {
    return 'strong'
  }
  if (BEATS[defender] === attacker) {
    return 'weak'
  }
  return 'normal'
}

const effectivenessMultiplier: Record<Effectiveness, number> = {
  strong: STRONG_MULTIPLIER,
  weak: WEAK_MULTIPLIER,
  normal: 1,
}

// mulberry32: tiny, fast, good enough for game rolls.
export const createRng = (seed: number) => {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const simulateBattle = (player: IFighter, enemy: IFighter, seed: number): IBattleResult => {
  const rng = createRng(seed)
  const fighters: Record<BattleSide, IFighter> = { player, enemy }
  const hp: Record<BattleSide, number> = { player: player.stats.hp, enemy: enemy.stats.hp }
  const events: IBattleEvent[] = []

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const playerFirst =
      player.stats.spd > enemy.stats.spd || (player.stats.spd === enemy.stats.spd && rng() < 0.5)
    const order: BattleSide[] = playerFirst ? ['player', 'enemy'] : ['enemy', 'player']

    for (const actor of order) {
      const target: BattleSide = actor === 'player' ? 'enemy' : 'player'
      const attacker = fighters[actor]
      const defender = fighters[target]
      const isSkill = round % SKILL_EVERY_ROUNDS === 0
      const effectiveness = getEffectiveness(attacker.element, defender.element)
      const isCritical = rng() < CRITICAL_CHANCE
      const variance = 1 - DAMAGE_VARIANCE + rng() * DAMAGE_VARIANCE * 2

      const raw =
        attacker.stats.atk *
          (isSkill ? attacker.skill.power : 1) *
          effectivenessMultiplier[effectiveness] -
        defender.stats.def * DEFENSE_FACTOR
      const damage = Math.max(
        1,
        Math.round(raw * variance * (isCritical ? CRITICAL_MULTIPLIER : 1))
      )
      hp[target] = Math.max(0, hp[target] - damage)

      events.push({
        round,
        actor,
        moveName: isSkill ? attacker.skill.name : 'โจมตี',
        isSkill,
        damage,
        isCritical,
        effectiveness,
        targetHp: hp[target],
      })

      if (hp[target] === 0) {
        return { won: target === 'enemy', rounds: round, events }
      }
    }
  }

  // Nobody fell within the round limit: the challenger failed to win.
  return { won: false, rounds: MAX_ROUNDS, events }
}
