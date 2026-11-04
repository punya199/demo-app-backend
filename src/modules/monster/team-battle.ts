import { BURN_DAMAGE_ATK_RATIO, createRng, IBattleEvent, rollHit } from './battle-engine'
import { IFighter } from './battle-stats'

// A team of fighters against one boss. The 1-vs-1 `simulateBattle` is left alone so stored fights
// keep replaying; this engine is for fights that need several fighters on one side (World Boss
// with a rented ally, later Party Raid) and reuses the same hit roll, set effects and RNG.
//
// The boss's `stats.hp` is its HP going in (the World Boss passes the HP the whole server has left),
// so the fight can defeat it and `damageDealt` is exactly the HP it lost.

export const TEAM_BATTLE_SKILL_EVERY_ROUNDS = 3

// Replay events keep the 1-vs-1 shape (`actor` is 'player' for the team, 'enemy' for the boss)
// plus `member`: the team member who attacked, or who was hit when the boss attacks.
export interface ITeamBattleEvent extends IBattleEvent {
  member: number
}

export interface ITeamBattleResult {
  rounds: number
  events: ITeamBattleEvent[]
  // HP the boss lost, burn included. The same number the boss's HP dropped by.
  damageDealt: number
  // How much of damageDealt each team member is responsible for (burn goes to whoever lit it, and
  // the finishing hit counts only the HP that was left). Adds up to damageDealt.
  damageByMember: number[]
  bossHpAfter: number
  bossDefeated: boolean
  // Team members still standing at the end.
  survivors: number[]
}

interface ICombatant {
  fighter: IFighter
  side: 'player' | 'enemy'
  member: number
  hp: number
  maxHp: number
  shield: number
  burn: { turns: number; damage: number; source: number } | null
}

const makeCombatant = (
  fighter: IFighter,
  side: 'player' | 'enemy',
  member: number
): ICombatant => ({
  fighter,
  side,
  member,
  hp: fighter.stats.hp,
  maxHp: fighter.stats.hp,
  shield:
    Math.round(fighter.stats.hp * (fighter.effects?.shieldPct ?? 0)) +
    (fighter.bossMods?.shield ?? 0),
  burn: null,
})

// How many times a boss's scaling has stepped up by `round` (rounds 1..N are level 0).
export const bossScaleLevel = (fighter: IFighter, round: number) => {
  const scaling = fighter.bossMods?.scaling
  return scaling ? Math.floor((round - 1) / scaling.everyRounds) : 0
}

// The fighter as it fights in `round`: a boss's atk and def with enrage and scaling applied. Pure
// maths, no RNG, and the same object back for anyone without boss mods.
const withBossMods = (combatant: ICombatant, round: number): IFighter => {
  const { fighter } = combatant
  const mods = fighter.bossMods
  if (!mods) {
    return fighter
  }
  const level = bossScaleLevel(fighter, round)
  const atk =
    (mods.enrage && round >= mods.enrage.round ? mods.enrage.mult : 1) *
    (mods.scaling ? mods.scaling.atkMult ** level : 1)
  const def = mods.scaling ? mods.scaling.defMult ** level : 1
  if (atk === 1 && def === 1) {
    return fighter
  }
  return {
    ...fighter,
    stats: {
      ...fighter.stats,
      atk: Math.round(fighter.stats.atk * atk),
      def: Math.round(fighter.stats.def * def),
    },
  }
}

export const simulateTeamBattle = (
  team: IFighter[],
  boss: IFighter,
  seed: number,
  maxRounds: number,
  options: { ignoreElements?: boolean } = { ignoreElements: true }
): ITeamBattleResult => {
  const rng = createRng(seed)
  const members = team.map((fighter, index) => makeCombatant(fighter, 'player', index))
  const bossCombatant = makeCombatant(boss, 'enemy', 0)
  const events: ITeamBattleEvent[] = []
  const damageByMember = team.map(() => 0)

  const result = (round: number): ITeamBattleResult => ({
    rounds: round,
    events,
    damageDealt: boss.stats.hp - bossCombatant.hp,
    damageByMember,
    bossHpAfter: bossCombatant.hp,
    bossDefeated: bossCombatant.hp === 0,
    survivors: members.filter(member => member.hp > 0).map(member => member.member),
  })
  const isOver = () => bossCombatant.hp === 0 || members.every(member => member.hp === 0)

  // Pushes an event; `memberIndex` is whoever on the team is involved.
  const record = (
    round: number,
    actor: ICombatant,
    target: ICombatant,
    detail: Omit<IBattleEvent, 'round' | 'actor' | 'targetHp'>
  ) => {
    events.push({
      round,
      actor: actor.side,
      targetHp: target.hp,
      member: actor.side === 'player' ? actor.member : target.member,
      ...detail,
    })
  }

  const strike = (
    round: number,
    attacker: ICombatant,
    target: ICombatant,
    isSkill: boolean,
    kind?: 'double'
  ) => {
    const { damage, isCritical, effectiveness, isDodged } = rollHit(
      withBossMods(attacker, round),
      withBossMods(target, round),
      isSkill,
      rng,
      options.ignoreElements
    )
    const absorbed = Math.min(target.shield, damage)
    target.shield -= absorbed
    const hpBefore = target.hp
    target.hp = Math.max(0, target.hp - (damage - absorbed))
    const hpDamage = hpBefore - target.hp
    if (attacker.side === 'player') {
      damageByMember[attacker.member] += hpDamage
    }
    // Passive keystones, as in the 1-vs-1 engine: skipped for fighters without them, no RNG.
    let healed = 0
    const lifesteal = attacker.fighter.effects?.lifesteal
    if (lifesteal && hpDamage > 0 && attacker.hp < attacker.maxHp) {
      healed = Math.min(attacker.maxHp - attacker.hp, Math.max(1, Math.round(hpDamage * lifesteal)))
      attacker.hp += healed
    }
    let reflected = 0
    const thorns = target.fighter.effects?.thorns
    if (thorns && damage > 0 && target.hp > 0) {
      const hpBeforeReflect = attacker.hp
      reflected = Math.max(1, Math.round(damage * thorns))
      attacker.hp = Math.max(0, attacker.hp - reflected)
      // Reflected damage on the boss counts for the member who reflected it, so the per-member
      // totals still add up to the boss's lost HP.
      if (attacker.side === 'enemy') {
        damageByMember[target.member] += hpBeforeReflect - attacker.hp
      }
    }
    record(round, attacker, target, {
      moveName: isSkill ? attacker.fighter.skill.name : 'โจมตี',
      isSkill,
      damage,
      isCritical,
      effectiveness,
      ...(kind && { kind }),
      ...(absorbed > 0 && { absorbed }),
      ...(isDodged && { isDodged }),
      ...(healed > 0 && { healed }),
      ...(reflected > 0 && { reflected }),
      ...((healed > 0 || reflected > 0) && { actorHp: attacker.hp }),
    })
  }

  for (let round = 1; round <= maxRounds; round++) {
    // First strike goes before speed, then fastest first; on a tie the team goes before the boss,
    // members in team order. No RNG here.
    const order = [...members, bossCombatant]
      .filter(combatant => combatant.hp > 0)
      .sort(
        (a, b) =>
          Number(!!b.fighter.effects?.firstStrike) - Number(!!a.fighter.effects?.firstStrike) ||
          b.fighter.stats.spd - a.fighter.stats.spd
      )
    const isSkill = round % TEAM_BATTLE_SKILL_EVERY_ROUNDS === 0
    // The boss grows stronger at the start of every `everyRounds`-th round after the first block.
    const scaleLevel = bossScaleLevel(boss, round)
    if (scaleLevel > 0 && (round - 1) % (boss.bossMods?.scaling?.everyRounds ?? 1) === 0) {
      events.push({
        round,
        actor: 'enemy',
        member: 0,
        moveName: 'บอสแข็งแกร่งขึ้น',
        isSkill: false,
        damage: 0,
        isCritical: false,
        effectiveness: 'normal',
        targetHp: bossCombatant.hp,
        kind: 'scale',
        scaleLevel,
      })
    }

    for (const actor of order) {
      if (actor.hp === 0) {
        continue
      }
      // Start of this fighter's turn: burn ticks, then regeneration. The event's `actor` is the
      // opposite side, as in the 1-vs-1 engine, so replay code reads it as "that side's HP changed".
      if (actor.burn) {
        const burning = actor.burn
        const hpBeforeBurn = actor.hp
        actor.hp = Math.max(0, actor.hp - burning.damage)
        if (actor.side === 'enemy') {
          damageByMember[burning.source] += hpBeforeBurn - actor.hp
        }
        burning.turns -= 1
        if (burning.turns <= 0) {
          actor.burn = null
        }
        events.push({
          round,
          actor: actor.side === 'player' ? 'enemy' : 'player',
          member: actor.side === 'player' ? actor.member : 0,
          moveName: 'เผาไหม้',
          isSkill: false,
          damage: burning.damage,
          isCritical: false,
          effectiveness: 'normal',
          targetHp: actor.hp,
          kind: 'burn',
        })
        if (actor.hp === 0) {
          if (isOver()) {
            return result(round)
          }
          continue
        }
      }
      const regen = actor.fighter.effects?.regenPct
      if (regen && actor.hp < actor.maxHp) {
        const healed = Math.min(actor.maxHp - actor.hp, Math.round(actor.maxHp * regen))
        if (healed > 0) {
          actor.hp += healed
          events.push({
            round,
            actor: actor.side === 'player' ? 'enemy' : 'player',
            member: actor.side === 'player' ? actor.member : 0,
            moveName: 'ฟื้นฟู',
            isSkill: false,
            damage: healed,
            isCritical: false,
            effectiveness: 'normal',
            targetHp: actor.hp,
            kind: 'regen',
          })
        }
      }

      // Team members hit the boss; the boss hits a random member still standing.
      const alive = members.filter(member => member.hp > 0)
      const target =
        actor.side === 'player'
          ? bossCombatant
          : alive.length > 1
            ? alive[Math.floor(rng() * alive.length)]
            : alive[0]

      strike(round, actor, target, isSkill)
      if (isOver()) {
        return result(round)
      }
      // Only thorns can drop the attacker here.
      if (actor.hp === 0) {
        continue
      }
      if (isSkill && actor.fighter.effects?.burnTurns && target.hp > 0) {
        target.burn = {
          turns: actor.fighter.effects.burnTurns,
          damage: Math.max(1, Math.round(actor.fighter.stats.atk * BURN_DAMAGE_ATK_RATIO)),
          source: actor.member,
        }
      }
      const doubleChance = actor.fighter.effects?.doubleStrikeChance
      if (doubleChance && rng() < doubleChance) {
        strike(round, actor, target, false, 'double')
        if (isOver()) {
          return result(round)
        }
        if (actor.hp === 0) {
          continue
        }
      }
    }
  }

  return result(maxRounds)
}
