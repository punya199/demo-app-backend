import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { ADVENTURE_AREAS } from '../adventure/adventure-data'
import { IFighterEffects } from '../battle/battle-stats'
import { NO_EQUIPMENT_BONUS } from '../equipment/equipment-data'
import { createEgg } from '../core/monster-engine'
import { FUSED_FORMS, fusedSpeciesId } from '../core/species-data'
import { ARENA_SKILLS, ARENA_STAGES, ARENA_TUNING } from './arena-data'
import {
  ARENA_SKILL_BY_ID,
  canEquipArenaSkill,
  getArenaSkill,
  simulateArena,
  tunedSkill,
} from './arena-engine'
import {
  arenaEnemyOf,
  arenaInnateOf,
  cleanArenaLoadout,
  toArenaFighter,
  unlockedArenaSkillIds,
} from './arena-fighter'
import {
  ARENA_ATTACK_SPEED_CAP,
  ARENA_BURN_CHANCE,
  ARENA_LAST_STAND_BELOW,
  ARENA_SHIELD_REFRESH_SEC,
  LINE_EVA,
  skillTierPct,
} from './arena-rules'
import { IArenaFighterSpec, IArenaPassive } from './arena-types'

const NOW = new Date('2026-01-01T03:00:00Z')

const pet = (line: EnumMonsterLine, suffix: string, stage: EnumMonsterStage) => ({
  ...createEgg(line, NOW),
  speciesId: `${line}_${suffix}`,
  stage,
  fullness: 4,
  strength: 3,
  weight: 40,
})

const fighter = (overrides: Partial<IArenaFighterSpec> = {}): IArenaFighterSpec => ({
  name: 'a',
  emoji: '🦎',
  element: 'flame',
  hp: 80,
  atk: 16,
  def: 10,
  spd: 12,
  eva: 5,
  acc: 8,
  res: 8,
  skills: ['flame_tail', 'flame_lava', 'n_tackle'],
  dodge: 'dg_step',
  ...overrides,
})
const foe = () =>
  fighter({
    name: 'b',
    element: 'tide',
    skills: ['tide_sword', 'tide_ink', 'n_guard'],
    dodge: 'dg_parry',
  })

describe('arena engine', () => {
  it('replays a fight exactly from its seed, recorded or not', () => {
    const recorded = simulateArena([[fighter()], [foe()]], 42, { record: true })
    const plain = simulateArena([[fighter()], [foe()]], 42)
    expect(plain.checksum).toBe(recorded.checksum)
    expect(plain.winner).toBe(recorded.winner)
    expect(recorded.frames.length).toBe(recorded.ticks + 1)
    expect(simulateArena([[fighter()], [foe()]], 43).checksum).not.toBe(recorded.checksum)
  })

  // Pinned: the engine is a port of the demo the balance was tuned on. If this changes, every
  // tuned number may be off; re-run the balance harness before updating it.
  it('keeps producing the pinned fight', () => {
    const result = simulateArena([[fighter()], [foe()]], 20261104)
    expect({ winner: result.winner, ticks: result.ticks, checksum: result.checksum }).toEqual(
      PINNED
    )
  })

  it('only lets a monster equip its own element, neutral skills and one passive', () => {
    const owner = { elements: ['flame' as const], innate: 'flame_tail' }
    const skill = (id: string) => ARENA_SKILL_BY_ID[id]
    expect(canEquipArenaSkill(owner, skill('flame_lava'))).toBe(true)
    expect(canEquipArenaSkill(owner, skill('n_tackle'))).toBe(true)
    expect(canEquipArenaSkill(owner, skill('tide_ink'))).toBe(false)
    expect(canEquipArenaSkill(owner, skill('flame_tail'))).toBe(false)
    expect(canEquipArenaSkill(owner, skill('dg_vanish'))).toBe(true)
    expect(canEquipArenaSkill(owner, skill('e_stomp'))).toBe(false)
    expect(canEquipArenaSkill(owner, skill('flame_phoenix'))).toBe(true)
    // Ent's innate is a passive: no second passive anywhere in the loadout.
    const ent = { elements: ['leaf' as const], innate: 'leaf_ent' }
    expect(canEquipArenaSkill(ent, skill('shd_sting'))).toBe(false)
    expect(
      canEquipArenaSkill({ elements: ['leaf'], innate: 'leaf_antler' }, skill('leaf_ent'), [
        'leaf_ent',
      ])
    ).toBe(false)
  })
})

describe('gear and trainer-tree effects', () => {
  const plain = (passive?: IArenaPassive) =>
    fighter({ skills: [], dodge: null, ...(passive && { passive }) })
  const dummy = (passive?: IArenaPassive) =>
    fighter({
      name: 'b',
      element: 'tide',
      hp: 4000,
      skills: [],
      dodge: null,
      ...(passive && { passive }),
    })
  const fight = (a: IArenaFighterSpec, b: IArenaFighterSpec, seed = 7) =>
    simulateArena([[a], [b]], seed, { record: true })
  const hitsBy = (result: ReturnType<typeof fight>, who: number) =>
    result.events.filter(event => event.kind === 'hit' && event.who === who)

  it('carries every fighter effect into the arena', () => {
    const effects: Required<IFighterEffects> = {
      burnTurns: 2,
      shieldPct: 0.1,
      regenPct: 0.0036,
      doubleStrikeChance: 0.2,
      critChance: 0.05,
      critDamage: 0.5,
      evasion: 0.04,
      lifesteal: 0.1,
      thorns: 0.15,
      firstStrike: 1,
      noCrit: 1,
      burnBonus: 0.1,
      shieldRefresh: 0.045,
      cooldownCut: 0.22,
      lastStandShield: 0.15,
      dodgeCdCutSec: 4,
      afterDodgeBonus: 1,
      damageCut: 0.1,
      executeBonus: 0.3,
      slowOnBasic: 20,
      defDownOnBasic: 20,
      poisonOnBasic: 20,
      curseOnBasic: 20,
      stunOnBasic: 10,
      poisonBonus: 0.2,
      retort: 0.5,
    }
    const spec = toArenaFighter(pet(EnumMonsterLine.FLAME, 'adultGood', EnumMonsterStage.ADULT), {
      ...NO_EQUIPMENT_BONUS,
      effects,
    })
    expect(spec.passive).toEqual({
      onBasic: { st: 'burn', dur: 2, ch: ARENA_BURN_CHANCE },
      startShield: 10,
      regenPct: 0.36,
      doubleStrike: 20,
      critDamage: 50,
      basicLifesteal: 10,
      thorns: 15,
      firstStrike: true,
      noCrit: true,
      bonusVsStatus: { st: 'burn', pct: 10 },
      shieldEvery: { pct: 5, sec: ARENA_SHIELD_REFRESH_SEC },
      cdCut: 22,
      lastStand: { belowPct: ARENA_LAST_STAND_BELOW, shield: 15, immuneSec: 2 },
      dodgeCdCut: 4,
      afterDodge: { critNext: true, bonus: 100 },
      damageCut: 10,
      executeVs: { belowPct: 30, pct: 30 },
      onBasicExtra: [
        { st: 'slow', dur: 2, ch: 20 },
        { st: 'defDown', dur: 3, ch: 20 },
        { st: 'poison', dur: 4, ch: 20 },
        { st: 'curse', dur: 3, ch: 20 },
        { st: 'stun', dur: 1, ch: 10 },
      ],
      meleeRetort: { power: 0, st: 'blind', dur: 2, ch: 50 },
    })
    expect(spec.crit).toBeGreaterThanOrEqual(5)
    expect(spec.eva).toBeGreaterThanOrEqual(LINE_EVA.flame + 4)
  })

  it('turns an SPD bonus from gear and the tree into attack speed, up to the cap', () => {
    const attackSpeed = (spd: number) =>
      toArenaFighter(pet(EnumMonsterLine.FLAME, 'adultGood', EnumMonsterStage.ADULT), {
        ...NO_EQUIPMENT_BONUS,
        pct: { ...NO_EQUIPMENT_BONUS.pct, spd },
      }).passive?.attackSpeed
    expect(attackSpeed(0.4)).toBe(20)
    expect(attackSpeed(2)).toBe(ARENA_ATTACK_SPEED_CAP)
    expect(attackSpeed(-0.3)).toBeUndefined()
    expect(attackSpeed(0)).toBeUndefined()
  })

  it('attacks more often with attack speed', () => {
    const basics = (passive?: IArenaPassive) => {
      const hits = hitsBy(fight(plain(passive), dummy()), 0)
      return hits[hits.length - 1].t / hits.length
    }
    expect(basics({ attackSpeed: 30 })).toBeLessThan(basics())
  })

  it('starts with a shield that has no timer', () => {
    const result = fight(plain({ startShield: 25 }), dummy())
    const maxHp = result.fighters[0].maxHp
    expect(result.frames[0].f[0][8]).toBe(Math.trunc(maxHp / 4))
    expect(fight(plain(), dummy()).frames[0].f[0][8]).toBe(0)
  })

  it('adds crit damage to the multiplier and lets noCrit stop every crit', () => {
    const firstCrit = (passive?: IArenaPassive) =>
      hitsBy(fight(plain(passive), dummy()), 0).find(event => event.crit)
    expect(firstCrit({ critDamage: 100 })?.dmg).toBeGreaterThan(firstCrit()?.dmg ?? Infinity)
    const noCrit = fight(plain({ noCrit: true }), dummy())
    expect(hitsBy(noCrit, 0).length).toBeGreaterThan(0)
    expect(hitsBy(noCrit, 0).some(event => event.crit)).toBe(false)
  })

  it('strikes twice on a basic attack', () => {
    const ticks = hitsBy(fight(plain({ doubleStrike: 100 }), dummy()), 0).map(event => event.t)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks[0]).toBe(ticks[1])
  })

  it('has its skills ready at the start with first strike', () => {
    const firstCast = (passive?: IArenaPassive) =>
      fight(fighter({ dodge: null, ...(passive && { passive }) }), dummy()).events.find(
        event => event.kind === 'skill' && event.who === 0
      )?.t ?? Infinity
    expect(firstCast({ firstStrike: true })).toBeLessThan(firstCast())
  })

  it('sends a share of the HP lost back to the attacker', () => {
    const result = fight(plain(), dummy({ thorns: 50 }))
    const thorns = result.events.filter(event => event.kind === 'thorns')
    expect(thorns.length).toBeGreaterThan(0)
    expect(thorns[0]).toMatchObject({ who: 0, by: 1 })
    expect(thorns[0].dmg).toBe(Math.max(1, Math.trunc((hitsBy(result, 0)[0].dmg ?? 0) / 2)))
  })

  it('hits a target under the execute line harder, only with the passive', () => {
    const firstHit = (passive?: IArenaPassive) => hitsBy(fight(plain(passive), dummy()), 0)
    // The dummy starts at full HP, so the bonus waits until it is below 30%.
    const withBonus = firstHit({ executeVs: { belowPct: 30, pct: 100 } })
    const without = firstHit()
    expect(withBonus[0].dmg).toBe(without[0].dmg)
    expect(withBonus.length).toBeLessThanOrEqual(without.length)
    const low = fighter({
      skills: [],
      dodge: null,
      passive: { executeVs: { belowPct: 101, pct: 100 } },
    })
    expect(hitsBy(fight(low, dummy()), 0)[0].dmg).toBeGreaterThan(without[0].dmg ?? Infinity)
  })

  it('applies extra statuses on basic attacks and leaves other fights untouched', () => {
    const statuses = (passive?: IArenaPassive) =>
      fight(plain(passive), dummy()).events.filter(event => event.kind === 'status')
    expect(statuses()).toHaveLength(0)
    const slowed = statuses({ onBasicExtra: [{ st: 'slow', dur: 2, ch: 100 }] })
    expect(slowed.length).toBeGreaterThan(0)
    expect(slowed.every(event => event.st === 'slow' && event.who === 1)).toBe(true)
  })

  it('adds tree regen to a passive skill instead of losing it', () => {
    const healed = (passive?: IArenaPassive) =>
      fight(fighter({ skills: ['leaf_ent'], dodge: null, ...(passive && { passive }) }), foe())
        .fighters[0].healed
    expect(healed({ regenPct: 3 })).toBeGreaterThan(healed())
  })
})

describe('arena skills in the game', () => {
  it('unlocks a skill for every species in the Dex', () => {
    const ids = unlockedArenaSkillIds(['flame_adultGood', 'tide_baby2', 'leaf_baby1'])
    expect(ids.sort()).toEqual(['dg_step', 'flame_tail', 'n_breath'].sort())
  })

  it('gives skills from Adult up only, and a fused form its own skill', () => {
    expect(arenaInnateOf(pet(EnumMonsterLine.FLAME, 'baby2', EnumMonsterStage.BABY_2))).toBeNull()
    expect(arenaInnateOf(pet(EnumMonsterLine.FLAME, 'adultGood', EnumMonsterStage.ADULT))).toBe(
      'flame_tail'
    )
    expect(
      arenaInnateOf({
        speciesId: 'fused_flame_tide',
        line: EnumMonsterLine.TIDE,
        stage: EnumMonsterStage.FUSED,
      })
    ).toBe('fz_flame_tide')
    expect(
      arenaInnateOf({
        speciesId: 'fused_tide_tide',
        line: EnumMonsterLine.TIDE,
        stage: EnumMonsterStage.FUSED,
      })
    ).toBe('fz_tide_tide')
  })

  it('gives every Fused form its own skill', () => {
    for (const [a, b] of FUSED_FORMS) {
      const id = fusedSpeciesId(a, b)
      expect(arenaInnateOf({ speciesId: id, line: a, stage: EnumMonsterStage.FUSED })).toBe(
        `fz_${id.slice('fused_'.length)}`
      )
    }
  })

  it('scales skill strength by the stage of the form that carries it', () => {
    const at = (id: string) => getArenaSkill(id)
    const raw = (id: string) => ARENA_SKILL_BY_ID[id]
    const pow = (id: string) => ARENA_TUNING[id]?.pow ?? 100
    const expected = (id: string, tier: number) =>
      Math.round((raw(id).power! * Math.round((pow(id) * tier) / 100)) / 100)
    expect(at('n_whip').power).toBe(expected('n_whip', 75))
    expect(at('flame_tail').power).toBe(expected('flame_tail', 100))
    expect(at('flame_claw').power).toBe(expected('flame_claw', 120))
    expect(at('flame_sun').power).toBe(expected('flame_sun', 140))
    expect(at('fz_flame_flame').power).toBe(expected('fz_flame_flame', 160))
    // dodges and enemy skills keep their numbers
    expect(at('dg_step')).toEqual(tunedSkill(raw('dg_step')))
    expect(skillTierPct('enemy')).toBe(100)
  })

  it('drops loadout picks that are no longer legal', () => {
    const adult = pet(EnumMonsterLine.FLAME, 'adultGood', EnumMonsterStage.ADULT)
    const unlocked = new Set(['flame_lava', 'tide_ink', 'dg_step', 'flame_tail'])
    expect(
      cleanArenaLoadout(adult, { s1: 'flame_lava', s2: 'tide_ink', dodge: 'dg_step' }, unlocked)
    ).toEqual({ s1: 'flame_lava', s2: null, dodge: 'dg_step' })
    // Not unlocked, or the pet's own innate (after evolving into that form).
    expect(
      cleanArenaLoadout(
        adult,
        { s1: 'flame_claw', s2: 'flame_tail', dodge: 'flame_lava' },
        unlocked
      )
    ).toEqual({ s1: null, s2: null, dodge: null })
    const baby = pet(EnumMonsterLine.FLAME, 'baby2', EnumMonsterStage.BABY_2)
    expect(
      cleanArenaLoadout(baby, { s1: 'flame_lava', s2: null, dodge: 'dg_step' }, unlocked)
    ).toEqual({
      s1: null,
      s2: null,
      dodge: null,
    })
  })

  it('builds a fighter from the real monster with its innate and slots', () => {
    const spec = toArenaFighter(
      pet(EnumMonsterLine.FLAME, 'adultGood', EnumMonsterStage.ADULT),
      undefined,
      { s1: 'flame_lava', s2: null, dodge: 'dg_flip' }
    )
    expect(spec.skills).toEqual(['flame_tail', 'flame_lava'])
    expect(spec.dodge).toBe('dg_flip')
    expect(spec.element).toBe('flame')
    const baby = toArenaFighter(pet(EnumMonsterLine.TIDE, 'baby1', EnumMonsterStage.BABY_1))
    expect(baby.skills).toEqual([])
    expect(baby.dodge).toBeNull()
  })

  it('has an arena enemy for every adventure stage: 1 skill, bosses 2', () => {
    for (const area of ADVENTURE_AREAS) {
      for (const stage of area.stages) {
        const arena = ARENA_STAGES[stage.id]
        expect(arena).toBeDefined()
        expect(arena.boss).toBe(stage.isBoss)
        expect(arena.skills).toHaveLength(stage.isBoss ? 2 : 1)
        for (const id of arena.skills) expect(ARENA_SKILL_BY_ID[id]).toBeDefined()
        const enemy = arenaEnemyOf(arena)
        expect(enemy.hp).toBeGreaterThan(0)
      }
    }
  })

  it('has a source species for every player skill', () => {
    for (const skill of ARENA_SKILLS)
      expect(skill.src).toMatch(/^([a-z]+_[A-Za-z0-9]+|fused_[a-z]+_[a-z]+)$/)
  })
})

// Re-pinned on purpose 2026-11-09: the skill tiers (SKILL_TIER_PCT) change skill strength.
const PINNED = { winner: 1, ticks: 625, checksum: 'ff9a0fcb' }
