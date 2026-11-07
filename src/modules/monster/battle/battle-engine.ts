import { EnumMonsterLine } from '../../../db/entities/monster.entity'
import { IFighter, SECONDS_PER_TURN } from './battle-stats'

// Deterministic auto-battle: the same fighters and seed always replay the same fight, so the
// server can decide results and the client only animates the returned events.

export const MAX_ROUNDS = 20
// Every SKILL_EVERY_ROUNDS-th round a fighter uses its skill instead of a basic attack.
export const SKILL_EVERY_ROUNDS = 3
export const CRITICAL_CHANCE = 0.15
export const CRITICAL_MULTIPLIER = 1.5
export const STRONG_MULTIPLIER = 1.3
export const WEAK_MULTIPLIER = 0.8
// Defense cuts damage by DEF / (DEF + DEFENSE_K): never 0% or 100%, with diminishing returns.
export const DEFENSE_K = 40
// Defense can never cut more than this share of a hit.
export const MAX_DEFENSE_REDUCTION = 0.75
// Each hit lands between (1 - DAMAGE_VARIANCE) and (1 + DAMAGE_VARIANCE) of its base damage.
export const DAMAGE_VARIANCE = 0.15

export type BattleSide = 'player' | 'enemy'
export type Effectiveness = 'strong' | 'weak' | 'normal'

// What a set effect did, for the replay: burn ticks and regen happen at the start of the affected
// fighter's turn, a double strike is the extra hit right after an attack.
export type BattleEventKind = 'burn' | 'regen' | 'double'

export interface IBattleEvent {
  round: number
  // Who caused it. For a burn tick or regen the damaged/healed side is the opposite of `actor`, so
  // `actor !== side` still means "this side's HP changed" for replay code.
  actor: BattleSide
  moveName: string
  isSkill: boolean
  damage: number
  isCritical: boolean
  effectiveness: Effectiveness
  targetHp: number
  // Only present when a set effect is involved.
  kind?: BattleEventKind
  // Damage the target's set shield soaked up (included in `damage`).
  absorbed?: number
  // The target dodged the hit (damage is 0).
  isDodged?: boolean
  // Lifesteal: HP the attacker healed from this hit; thorns: damage reflected onto the attacker.
  // `actorHp` is the attacker's HP afterwards, present whenever one of them is.
  healed?: number
  reflected?: number
  actorHp?: number
}

export interface IBattleResult {
  won: boolean
  rounds: number
  events: IBattleEvent[]
}

// What each element beats (x1.3 against them; they hit it for x0.8). The natural ring has every
// element beat two and lose to two, and keeps the original triangle inside it: flame burns leaf,
// leaf drinks tide, tide douses flame.
export const BEATS: Record<EnumMonsterLine, EnumMonsterLine[]> = {
  [EnumMonsterLine.FLAME]: [EnumMonsterLine.LEAF, EnumMonsterLine.EARTH],
  [EnumMonsterLine.LEAF]: [EnumMonsterLine.TIDE, EnumMonsterLine.LIGHTNING],
  [EnumMonsterLine.TIDE]: [EnumMonsterLine.FLAME, EnumMonsterLine.EARTH],
  [EnumMonsterLine.EARTH]: [EnumMonsterLine.LEAF, EnumMonsterLine.LIGHTNING],
  [EnumMonsterLine.LIGHTNING]: [EnumMonsterLine.TIDE, EnumMonsterLine.FLAME],
  // The spiritual triangle. Across the two groups every hit is normal.
  [EnumMonsterLine.HOLY]: [EnumMonsterLine.DARK],
  [EnumMonsterLine.DARK]: [EnumMonsterLine.SHADOW],
  [EnumMonsterLine.SHADOW]: [EnumMonsterLine.HOLY],
}

export const getEffectiveness = (
  attacker: EnumMonsterLine,
  defender: EnumMonsterLine
): Effectiveness => {
  if (BEATS[attacker].includes(defender)) {
    return 'strong'
  }
  if (BEATS[defender].includes(attacker)) {
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

// A burn deals this share of the burner's ATK per tick, ignoring defense and shields.
export const BURN_DAMAGE_ATK_RATIO = 0.25

const opposite = (side: BattleSide): BattleSide => (side === 'player' ? 'enemy' : 'player')

export interface IHitRoll {
  damage: number
  isCritical: boolean
  effectiveness: Effectiveness
  // The defender dodged: no damage, and no crit or variance roll was spent.
  isDodged?: boolean
}

// One hit's damage: rolls (in this fixed order) crit then variance. Shared by the 1-vs-1 engine and
// the team engine so both always deal damage the same way.
export const rollHit = (
  attacker: IFighter,
  defender: IFighter,
  isSkill: boolean,
  rng: () => number,
  ignoreElements = false
): IHitRoll => {
  const effectiveness = ignoreElements
    ? 'normal'
    : getEffectiveness(attacker.element, defender.element)
  // Evasion is drawn from the RNG only for a defender that has it, so old fights replay unchanged.
  if (defender.effects?.evasion && rng() < defender.effects.evasion) {
    return { damage: 0, isCritical: false, effectiveness, isDodged: true }
  }
  // The roll is always drawn, even for a fighter that can't crit, so RNG order never changes.
  const critRoll = rng() < CRITICAL_CHANCE + (attacker.effects?.critChance ?? 0)
  const isCritical = critRoll && !attacker.effects?.noCrit
  const variance = 1 - DAMAGE_VARIANCE + rng() * DAMAGE_VARIANCE * 2
  const raw =
    attacker.stats.atk *
    (isSkill ? attacker.skill.power : 1) *
    effectivenessMultiplier[effectiveness] *
    (1 - Math.min(MAX_DEFENSE_REDUCTION, defender.stats.def / (defender.stats.def + DEFENSE_K)))
  const damage = Math.max(
    1,
    Math.round(
      raw * variance * (isCritical ? CRITICAL_MULTIPLIER + (attacker.effects?.critDamage ?? 0) : 1)
    )
  )
  return { damage, isCritical, effectiveness }
}

export interface IBattleOptions {
  // Fights where the element triangle must not decide the outcome (Boss Raid: every line has to be
  // able to beat every boss). Off by default, so existing fights replay unchanged.
  ignoreElements?: boolean
}

export const simulateBattle = (
  player: IFighter,
  enemy: IFighter,
  seed: number,
  options: IBattleOptions = {}
): IBattleResult => {
  const rng = createRng(seed)
  const fighters: Record<BattleSide, IFighter> = { player, enemy }
  const maxHp: Record<BattleSide, number> = { player: player.stats.hp, enemy: enemy.stats.hp }
  const hp: Record<BattleSide, number> = { player: player.stats.hp, enemy: enemy.stats.hp }
  // Set effects. Everything below that reads these is skipped for a fighter without effects, and
  // none of it touches the RNG unless the effect needs a roll (double strike).
  const shield: Record<BattleSide, number> = {
    player: Math.round(player.stats.hp * (player.effects?.shieldPct ?? 0)),
    enemy: Math.round(enemy.stats.hp * (enemy.effects?.shieldPct ?? 0)),
  }
  const burn: Record<BattleSide, { turns: number; damage: number } | null> = {
    player: null,
    enemy: null,
  }
  const events: IBattleEvent[] = []

  // One hit: rolls (in this fixed order) crit then variance, soaks it into the shield first.
  const strike = (round: number, actor: BattleSide, isSkill: boolean, kind?: BattleEventKind) => {
    const target = opposite(actor)
    const attacker = fighters[actor]
    const defender = fighters[target]
    const { damage, isCritical, effectiveness, isDodged } = rollHit(
      attacker,
      defender,
      isSkill,
      rng,
      options.ignoreElements
    )
    const absorbed = Math.min(shield[target], damage)
    shield[target] -= absorbed
    const hpDamage = damage - absorbed
    hp[target] = Math.max(0, hp[target] - hpDamage)

    // Passive keystones. Both are skipped for fighters without them and never touch the RNG.
    let healed = 0
    const lifesteal = attacker.effects?.lifesteal
    if (lifesteal && hpDamage > 0 && hp[actor] < maxHp[actor]) {
      healed = Math.min(maxHp[actor] - hp[actor], Math.max(1, Math.round(hpDamage * lifesteal)))
      hp[actor] += healed
    }
    let reflected = 0
    const thorns = defender.effects?.thorns
    if (thorns && damage > 0 && hp[target] > 0) {
      reflected = Math.max(1, Math.round(damage * thorns))
      hp[actor] = Math.max(0, hp[actor] - reflected)
    }

    events.push({
      round,
      actor,
      moveName: isSkill ? attacker.skill.name : 'โจมตี',
      isSkill,
      damage,
      isCritical,
      effectiveness,
      targetHp: hp[target],
      ...(kind && { kind }),
      ...(absorbed > 0 && { absorbed }),
      ...(isDodged && { isDodged }),
      ...(healed > 0 && { healed }),
      ...(reflected > 0 && { reflected }),
      ...((healed > 0 || reflected > 0) && { actorHp: hp[actor] }),
    })
  }

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // First strike beats speed when only one side has it; otherwise speed decides as before (the
    // tie-break roll is only drawn on an exact tie, so fights without the effect are unchanged).
    const playerFirstStrike = !!player.effects?.firstStrike
    const enemyFirstStrike = !!enemy.effects?.firstStrike
    const playerFirst =
      playerFirstStrike !== enemyFirstStrike
        ? playerFirstStrike
        : player.stats.spd > enemy.stats.spd ||
          (player.stats.spd === enemy.stats.spd && rng() < 0.5)
    const order: BattleSide[] = playerFirst ? ['player', 'enemy'] : ['enemy', 'player']

    for (const actor of order) {
      const target = opposite(actor)
      const attacker = fighters[actor]
      const isSkill = round % SKILL_EVERY_ROUNDS === 0

      // Start of this fighter's turn: burn ticks, then regeneration.
      const burning = burn[actor]
      if (burning) {
        hp[actor] = Math.max(0, hp[actor] - burning.damage)
        burning.turns -= 1
        if (burning.turns <= 0) {
          burn[actor] = null
        }
        events.push({
          round,
          actor: target,
          moveName: 'เผาไหม้',
          isSkill: false,
          damage: burning.damage,
          isCritical: false,
          effectiveness: 'normal',
          targetHp: hp[actor],
          kind: 'burn',
        })
        if (hp[actor] === 0) {
          return { won: actor === 'enemy', rounds: round, events }
        }
      }
      const regen = attacker.effects?.regenPct
      if (regen && hp[actor] < maxHp[actor]) {
        const healed = Math.min(
          maxHp[actor] - hp[actor],
          Math.round(maxHp[actor] * regen * SECONDS_PER_TURN)
        )
        if (healed > 0) {
          hp[actor] += healed
          events.push({
            round,
            actor: target,
            moveName: 'ฟื้นฟู',
            isSkill: false,
            damage: healed,
            isCritical: false,
            effectiveness: 'normal',
            targetHp: hp[actor],
            kind: 'regen',
          })
        }
      }

      strike(round, actor, isSkill)
      if (hp[target] === 0) {
        return { won: target === 'enemy', rounds: round, events }
      }
      // Only thorns can drop the attacker here.
      if (hp[actor] === 0) {
        return { won: actor === 'enemy', rounds: round, events }
      }
      if (isSkill && attacker.effects?.burnTurns) {
        burn[target] = {
          turns: attacker.effects.burnTurns,
          damage: Math.max(1, Math.round(attacker.stats.atk * BURN_DAMAGE_ATK_RATIO)),
        }
      }

      // One extra basic hit, rolled only for fighters that have the effect; it never chains.
      const doubleChance = attacker.effects?.doubleStrikeChance
      if (doubleChance && rng() < doubleChance) {
        strike(round, actor, false, 'double')
        if (hp[target] === 0) {
          return { won: target === 'enemy', rounds: round, events }
        }
        if (hp[actor] === 0) {
          return { won: actor === 'enemy', rounds: round, events }
        }
      }
    }
  }

  // Nobody fell within the round limit: the challenger failed to win.
  return { won: false, rounds: MAX_ROUNDS, events }
}
