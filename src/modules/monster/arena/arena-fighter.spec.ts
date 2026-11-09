import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { IFighter, toFighter } from '../battle/battle-stats'
import { NO_EQUIPMENT_BONUS } from '../equipment/equipment-data'
import { ARENA_SKILLS, ARENA_STAGES, ARENA_TUNING } from './arena-data'
import {
  arenaBossSpec,
  arenaBattleView,
  arenaElementsOf,
  arenaEnemyOf,
  arenaEnemyViewOf,
  arenaInnateOf,
  arenaSkillSource,
  arenaSpecOfFighter,
  cleanArenaLoadout,
  EMPTY_LOADOUT,
  findArenaStage,
  hasArenaSkills,
  scaleArenaSpec,
  toArenaFighter,
  unlockedArenaSkillIds,
} from './arena-fighter'
import { simulateArena } from './arena-engine'
import { wellCaredArenaFighter, wellCaredState } from './arena-test-helpers'
import {
  ARENA_ATTACK_SPEED_CAP,
  ARENA_BURN_CHANCE,
  ARENA_HP_SCALE,
  ARENA_LAST_STAND_BELOW,
  ARENA_SHIELD_REFRESH_SEC,
  BOSS_RES,
  LINE_ACC,
  LINE_EVA,
  LINE_RES,
} from './arena-rules'

const { FLAME, TIDE } = EnumMonsterLine
const { ADULT, ULTIMATE, FUSED, BABY_1 } = EnumMonsterStage
const ALL_UNLOCKED = new Set(ARENA_SKILLS.map(skill => skill.id))
const stateOf = (line: EnumMonsterLine, stage: EnumMonsterStage) =>
  stage === BABY_1 ? { ...wellCaredState(line, ADULT), stage } : wellCaredState(line, stage)
const innateOf = (line: EnumMonsterLine, stage: EnumMonsterStage) =>
  arenaInnateOf(stateOf(line, stage))
const skillsOf = (el: string, slot: string) =>
  ARENA_SKILLS.filter(skill => skill.el === el && skill.slot === slot)

describe('element and innate lookup', () => {
  it('reads a fused form from both parents, de-duplicated, and others from the line', () => {
    expect(arenaElementsOf({ speciesId: 'fused_flame_tide', line: FLAME })).toEqual([
      'flame',
      'tide',
    ])
    expect(arenaElementsOf({ speciesId: 'fused_flame_flame', line: FLAME })).toEqual(['flame'])
    expect(arenaElementsOf({ speciesId: 'flame_adultGood', line: FLAME })).toEqual(['flame'])
  })

  it('gives eggs and babies no skills at all', () => {
    expect(hasArenaSkills(BABY_1)).toBe(false)
    expect(hasArenaSkills(FUSED)).toBe(true)
    expect(innateOf(FLAME, BABY_1)).toBeNull()
  })

  it('gives an adult its own innate, a fused form its own skill (else its line ultimate), else null', () => {
    expect(innateOf(FLAME, ADULT)).toEqual(expect.any(String))
    const fused = { ...stateOf(FLAME, FUSED), speciesId: 'fused_flame_tide' }
    expect(arenaInnateOf(fused)).toBe('fz_flame_tide')
    const unknown = { ...stateOf(FLAME, FUSED), speciesId: 'fused_nobody' }
    expect(arenaInnateOf(unknown)).toBe(innateOf(FLAME, ULTIMATE))
    expect(arenaInnateOf({ ...stateOf(FLAME, ADULT), speciesId: 'nobody' })).toBeNull()
    expect(arenaInnateOf({ ...stateOf(FLAME, FUSED), line: 'void' as never })).toBeNull()
  })

  it('unlocks the skills carried by the species in the dex', () => {
    const unlocked = unlockedArenaSkillIds(['flame_adultGood', 'not_a_species'])
    expect(unlocked).toContain(innateOf(FLAME, ADULT))
    expect(
      unlocked.every(id => ARENA_SKILLS.find(skill => skill.id === id)!.src === 'flame_adultGood')
    ).toBe(true)
    expect(unlockedArenaSkillIds([])).toEqual([])
  })
})

describe('cleanArenaLoadout', () => {
  const adult = stateOf(FLAME, ADULT)
  const innate = innateOf(FLAME, ADULT)
  const actives = skillsOf('flame', 'active').filter(skill => skill.id !== innate)
  const dodges = ARENA_SKILLS.filter(skill => skill.slot === 'dodge')
  const foreign = skillsOf('tide', 'active')[0]

  it('is empty for babies and for a missing loadout', () => {
    const loadout = { s1: actives[0].id, s2: null, dodge: dodges[0].id }
    expect(cleanArenaLoadout(stateOf(FLAME, BABY_1), loadout, ALL_UNLOCKED)).toEqual(EMPTY_LOADOUT)
    expect(cleanArenaLoadout(adult, null, ALL_UNLOCKED)).toEqual(EMPTY_LOADOUT)
    expect(cleanArenaLoadout(adult, undefined, ALL_UNLOCKED)).toEqual(EMPTY_LOADOUT)
    expect(cleanArenaLoadout(adult, null, ALL_UNLOCKED)).not.toBe(EMPTY_LOADOUT)
  })

  it('keeps a legal loadout as it is', () => {
    const loadout = { s1: actives[0].id, s2: actives[1].id, dodge: dodges[0].id }
    expect(cleanArenaLoadout(adult, loadout, ALL_UNLOCKED)).toEqual(loadout)
  })

  it('drops skills that are locked, unknown, foreign, the innate, or in the wrong slot', () => {
    const s1 = cleanArenaLoadout(adult, { s1: actives[0].id }, new Set())
    expect(s1.s1).toBeNull()
    expect(cleanArenaLoadout(adult, { s1: 'nope' }, new Set(['nope'])).s1).toBeNull()
    expect(cleanArenaLoadout(adult, { s1: foreign.id }, ALL_UNLOCKED).s1).toBeNull()
    expect(cleanArenaLoadout(adult, { s1: innate }, ALL_UNLOCKED).s1).toBeNull()
    expect(cleanArenaLoadout(adult, { s1: dodges[0].id }, ALL_UNLOCKED).s1).toBeNull()
    expect(cleanArenaLoadout(adult, { dodge: actives[0].id }, ALL_UNLOCKED).dodge).toBeNull()
  })

  it('treats a missing id as an empty slot', () => {
    expect(
      cleanArenaLoadout(adult, { s1: null, s2: undefined, dodge: undefined }, ALL_UNLOCKED)
    ).toEqual(EMPTY_LOADOUT)
  })

  it('refuses the same skill twice and a second passive', () => {
    const twice = cleanArenaLoadout(adult, { s1: actives[0].id, s2: actives[0].id }, ALL_UNLOCKED)
    expect(twice).toEqual({ s1: actives[0].id, s2: null, dodge: null })
    // a fused form may carry either parent's passive, but only one of them
    const fused = { ...stateOf(FLAME, FUSED), speciesId: 'fused_flame_tide' }
    const two = cleanArenaLoadout(fused, { s1: 'flame_phoenix', s2: 'tide_jelly' }, ALL_UNLOCKED)
    expect(two.s1).toBe('flame_phoenix')
    expect(two.s2).toBeNull()
    const secondOnly = cleanArenaLoadout(adult, { s1: 'nope', s2: actives[0].id }, ALL_UNLOCKED)
    expect(secondOnly).toEqual({ s1: null, s2: actives[0].id, dodge: null })
  })
})

describe('toArenaFighter', () => {
  const adult = stateOf(FLAME, ADULT)
  const loadout = { s1: 'a', s2: null, dodge: 'dg_step' }

  it('uses the innate first, then the loadout, and the line modifiers, with default arguments', () => {
    const spec = toArenaFighter(adult)
    expect(spec.skills).toEqual([innateOf(FLAME, ADULT)])
    expect(spec.dodge).toBeNull()
    expect(spec.eva).toBe(LINE_EVA.flame)
    expect(spec.acc).toBe(LINE_ACC.flame)
    expect(spec.res).toBe(LINE_RES.flame)
    expect(spec.crit).toBe(0)
    expect(spec.passive).toEqual({})
    const withLoadout = toArenaFighter(adult, NO_EQUIPMENT_BONUS, loadout)
    expect(withLoadout.skills).toEqual([innateOf(FLAME, ADULT), 'a'])
    expect(withLoadout.dodge).toBe('dg_step')
  })

  it('babies fight without a dodge even with a loadout', () => {
    const spec = toArenaFighter(stateOf(FLAME, BABY_1), NO_EQUIPMENT_BONUS, loadout)
    expect(spec.dodge).toBeNull()
  })

  it('names the fighter after its nickname', () => {
    expect(toArenaFighter({ ...adult, nickname: 'Pip' }).name).toBe('Pip')
  })

  it('caps the attack speed from gear speed', () => {
    const gear = (spd: number) => ({
      ...NO_EQUIPMENT_BONUS,
      pct: { ...NO_EQUIPMENT_BONUS.pct, spd },
    })
    expect(toArenaFighter(adult, gear(0.2)).passive?.attackSpeed).toBe(10)
    expect(toArenaFighter(adult, gear(5)).passive?.attackSpeed).toBe(ARENA_ATTACK_SPEED_CAP)
    expect(toArenaFighter(adult, gear(0)).passive?.attackSpeed).toBeUndefined()
  })

  it('applies evasion and crit from trainer effects', () => {
    const gear = { ...NO_EQUIPMENT_BONUS, effects: { evasion: 0.1, critChance: 0.2 } }
    const spec = toArenaFighter(adult, gear)
    expect(spec.eva).toBe(LINE_EVA.flame + 10)
    expect(spec.crit).toBe(20)
  })

  describe('HP lean', () => {
    const lean = (key: string) => ARENA_TUNING[key].hp!

    it('uses the line and stage tuning, then the line tuning when the stage has none', () => {
      const hp = (state: ReturnType<typeof stateOf>) => toFighter(state).stats.hp
      expect(toArenaFighter(adult).hp).toBeCloseTo((hp(adult) * lean('line:flame:adult')) / 100, 5)
      const baby = stateOf(FLAME, BABY_1)
      expect(toArenaFighter(baby).hp).toBeCloseTo((hp(baby) * lean('line:flame')) / 100, 5)
    })

    it('falls back to 100 when no tuning exists', () => {
      const saved = ARENA_TUNING['line:flame']
      const baby = stateOf(FLAME, BABY_1)
      try {
        delete ARENA_TUNING['line:flame']
        expect(toArenaFighter(baby).hp).toBe(toFighter(baby).stats.hp)
      } finally {
        ARENA_TUNING['line:flame'] = saved
      }
    })

    it('reads a fused form on the ultimate tuning', () => {
      const fused = { ...stateOf(FLAME, ULTIMATE), stage: FUSED }
      expect(toArenaFighter(fused).hp).toBeCloseTo(
        (toFighter(fused).stats.hp * lean('line:flame:ultimate')) / 100,
        5
      )
    })
  })
})

describe('gear, trainer and craft effects as passives', () => {
  const fighter = (effects?: IFighter['effects']): IFighter => ({
    name: 'Dummy',
    emoji: '🎯',
    element: FLAME,
    stats: { hp: 100, atk: 10, def: 5, spd: 5 },
    skill: { name: 'Hit', power: 1 },
    effects,
  })

  it('has no passive effects without any effect', () => {
    expect(arenaSpecOfFighter(fighter()).passive).toEqual({})
    expect(arenaSpecOfFighter(fighter({})).passive).toEqual({})
  })

  it('translates every effect', () => {
    const passive = arenaSpecOfFighter(
      fighter({
        lifesteal: 0.1,
        critDamage: 0.25,
        noCrit: 1,
        doubleStrikeChance: 0.15,
        shieldPct: 0.2,
        firstStrike: 1,
        thorns: 0.05,
        regenPct: 0.0125,
        burnTurns: 2,
        burnBonus: 0.2,
        shieldRefresh: 0.1,
        cooldownCut: 0.15,
        lastStandShield: 0.3,
        dodgeCdCutSec: 1,
        afterDodgeBonus: 0.4,
        damageCut: 0.12,
        executeBonus: 0.3,
        slowOnBasic: 10,
        stunOnBasic: 5,
        poisonBonus: 0.5,
        retort: 0.6,
      })
    ).passive
    expect(passive).toMatchObject({
      basicLifesteal: 10,
      critDamage: 25,
      noCrit: true,
      doubleStrike: 15,
      startShield: 20,
      firstStrike: true,
      thorns: 5,
      regenPct: 1.25,
      onBasic: { st: 'burn', dur: 2, ch: ARENA_BURN_CHANCE },
      // a burn bonus keeps the single bonus-vs-status slot; the poison bonus does not replace it
      bonusVsStatus: { st: 'burn', pct: 20 },
      shieldEvery: { pct: 10, sec: ARENA_SHIELD_REFRESH_SEC },
      cdCut: 15,
      lastStand: { belowPct: ARENA_LAST_STAND_BELOW, shield: 30, immuneSec: 2 },
      dodgeCdCut: 1,
      afterDodge: { critNext: true, bonus: 40 },
      damageCut: 12,
      executeVs: { pct: 30 },
      onBasicExtra: [
        { st: 'slow', ch: 10 },
        { st: 'stun', ch: 5 },
      ],
      meleeRetort: { st: 'blind', ch: 60 },
    })
  })

  it('uses the poison bonus when nothing else took the slot', () => {
    const passive = arenaSpecOfFighter(fighter({ poisonBonus: 0.5 })).passive
    expect(passive?.bonusVsStatus).toEqual({ st: 'poison', pct: 50 })
  })

  it('NPC specs use the line default skills, a step dodge and the nickname', () => {
    const spec = arenaSpecOfFighter({ ...fighter(), nickname: 'Nick' })
    expect(spec.name).toBe('Nick')
    expect(spec.dodge).toBe('dg_step')
    expect(spec.skills).toHaveLength(2)
    expect(spec.skills.every(id => ARENA_SKILLS.find(s => s.id === id)!.el === 'flame')).toBe(true)
  })
})

describe('spec helpers', () => {
  const base = arenaSpecOfFighter({
    name: 'Dummy',
    emoji: '🎯',
    element: TIDE,
    stats: { hp: 200, atk: 40, def: 100, spd: 5 },
    skill: { name: 'Hit', power: 1 },
  })

  it('scales HP and ATK by k% and DEF by its square root', () => {
    const scaled = scaleArenaSpec(base, 400)
    expect(scaled).toMatchObject({ hp: 800, atk: 160, def: 200 })
  })

  it('builds a boss with extra RES, no dodge and the given skills', () => {
    const boss = arenaBossSpec(
      {
        name: 'Boss',
        emoji: '👹',
        element: FLAME,
        stats: { hp: 900, atk: 9, def: 9, spd: 9 },
        skill: { name: 'x', power: 1 },
      },
      ['s']
    )
    expect(boss).toMatchObject({
      boss: true,
      dodge: null,
      skills: ['s'],
      res: LINE_RES.flame + BOSS_RES,
    })
  })

  it('shows an enemy with HP as it is in the fight', () => {
    const view = arenaEnemyViewOf({ ...base, skills: [innateOf(FLAME, ADULT)!] })
    expect(view.isBoss).toBe(false)
    expect(view.stats.hp).toBe(200 * ARENA_HP_SCALE)
    expect(view.skills).toHaveLength(1)
    expect(arenaEnemyViewOf({ ...base, boss: true }).isBoss).toBe(true)
  })

  it('builds a battle view of a recorded fight', () => {
    const me = wellCaredArenaFighter(FLAME, ADULT)
    const foe = wellCaredArenaFighter(TIDE, ADULT)
    const arena = simulateArena([[me], [foe]], 3, { record: true })
    const view = arenaBattleView(arena, me, foe)
    expect(view.kind).toBe('arena')
    expect(view.won).toBe(arena.winner === 0)
    expect(view.player.name).toBe(me.name)
    expect(view.replay.checksum).toBe(arena.checksum)
    expect(view.rounds).toBeGreaterThan(0)
  })
})

describe('adventure stages', () => {
  it('finds a stage by id', () => {
    expect(findArenaStage('meadow_1')).toBe(ARENA_STAGES.meadow_1)
    expect(findArenaStage('nope')).toBeUndefined()
  })

  it('builds an enemy with a number strength, tuned k and boss RES', () => {
    const stage = { ...ARENA_STAGES.meadow_1, str: 2, boss: true }
    const enemy = arenaEnemyOf(stage)
    expect(enemy.boss).toBe(true)
    expect(enemy.res).toBe(LINE_RES[stage.el] + BOSS_RES)
    expect(enemy.dodge).toBeNull()
    expect(enemy.hp).toBeGreaterThan(arenaEnemyOf({ ...stage, str: 1 }).hp)
  })

  it('takes a per-stat strength, defaults k to 100 and adds no RES to a normal enemy', () => {
    const stage = {
      ...ARENA_STAGES.meadow_1,
      id: 'untuned',
      level: 'adult' as const,
      boss: false,
      str: { hp: 1, atk: 1, def: 1, spd: 1 },
    }
    const enemy = arenaEnemyOf(stage)
    expect(enemy.res).toBe(LINE_RES[stage.el])
    const doubled = arenaEnemyOf({ ...stage, str: { hp: 2, atk: 1, def: 1, spd: 1 } })
    expect(doubled.hp).toBe(enemy.hp * 2)
    expect(doubled.atk).toBe(enemy.atk)
  })

  it.each(['baby1', 'baby2', 'adult', 'perfect', 'ultimate'] as const)(
    'reads %s base stats',
    level => {
      expect(arenaEnemyOf({ ...ARENA_STAGES.meadow_1, id: 'x', level }).hp).toBeGreaterThan(0)
    }
  )
})

describe('arenaSkillSource', () => {
  it('names the species that carries a skill, or null for a non-species source', () => {
    expect(arenaSkillSource('flame_adultGood')).toMatchObject({
      speciesId: 'flame_adultGood',
      stage: ADULT,
    })
    expect(arenaSkillSource('enemy')).toBeNull()
  })
})
