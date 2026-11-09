import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { ARENA_SKILLS } from '../arena/arena-data'
import { simulateArena } from '../arena/arena-engine'
import { arenaInnateOf, toArenaFighter } from '../arena/arena-fighter'
import { wellCaredState } from '../arena/arena-test-helpers'
import { createRng } from '../battle/battle-engine'
import { CRAFT_SETS, ICraftSet } from './craft-sets'
import {
  buildSetPiece,
  calcEquipmentBonus,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  SET_DEFINITIONS,
} from './equipment-data'

// Balance gate for the craft sets (docs/tamagotchi/craft.md, section 9). Each craft set (4 pieces)
// fights every boss set (4 pieces) on the arena, same line on both sides, every line, both seats,
// with epic +10 gear and Ultimate forms (the conditions the boss sets were tuned under). The
// craft set's average win rate over the boss sets has to stay in a band; when it does not, retune
// the 4-piece numbers in craft-sets.ts, never the band.
//
//   standard sets 47-53%, flagship sets 47-55%, care sets (caretaker, wayfarer) 40-50%
//
// Measured win rates (average against the 7 boss sets) with the numbers in craft-sets.ts.
// Gate seeds 1-2 (224 fights per set), which is what this spec runs (after the skill tiers,
// 2026-11-09, which moved mirage, tempest_binder and aegis_oracle out of the band and their 4-piece
// numbers were retuned):
//   bulwark 47.3, evergreen 50.4, executioner 51.8, marksman 50.9, tempo 49.6, mirage 47.8,
//   venomancer 49.1, tempest_binder 53.1, thornmail 52.2, aegis_oracle 52.7,
//   caretaker 43.8 (care), wayfarer 45.1 (care)
// Out-of-sample check (before the skill tiers), seeds 11-20 and 41-50 (1120 fights per set per run); a set moves about
// +-3 points with the seeds, so the pinned seeds are not cherry-picked:
//   bulwark 52.3/49.0, evergreen 53.4/50.7, executioner 50.1/47.9, marksman 47.3/48.8,
//   tempo 48.6/47.2, mirage 51.0/50.0, venomancer 50.4/49.1, tempest_binder 52.2/56.1,
//   thornmail 50.5/48.7, aegis_oracle 49.8/51.4, caretaker 45.0/41.9, wayfarer 47.9/46.5

const SEEDS = 2
const LINES = Object.values(EnumMonsterLine)
const BOSS_SETS = Object.keys(SET_DEFINITIONS).filter(id => !CRAFT_SETS.some(set => set.id === id))

const BAND = {
  standard: [0.47, 0.53],
  flagship: [0.47, 0.55],
  care: [0.4, 0.5],
} as const
const bandOf = (set: ICraftSet) => BAND[set.care ? 'care' : set.flagship ? 'flagship' : 'standard']

// The same gear rolls for every set, so only the set bonus differs between two fighters.
const fighterWith = (line: EnumMonsterLine, setId: string) => {
  const state = wellCaredState(line, EnumMonsterStage.ULTIMATE)
  const innate = arenaInnateOf(state)
  const [s1, s2] = ARENA_SKILLS.filter(
    skill => skill.el === line && skill.slot === 'active' && skill.id !== innate
  )
  const items = Object.values(EnumEquipmentSlot).map((slot, index) => ({
    ...buildSetPiece(`${setId}_${slot}`, EnumEquipmentGrade.EPIC, createRng(index + 1)),
    enhanceLevel: 10,
  }))
  return toArenaFighter(state, calcEquipmentBonus(items), {
    s1: s1?.id ?? null,
    s2: s2?.id ?? null,
    dodge: 'dg_step',
  })
}

const duel = (a: string, b: string) => {
  let wins = 0
  let fights = 0
  for (const line of LINES) {
    const fa = fighterWith(line, a)
    const fb = fighterWith(line, b)
    for (let seed = 1; seed <= SEEDS; seed++) {
      wins += simulateArena([[fa], [fb]], seed).winner === 0 ? 1 : 0
      wins += simulateArena([[fb], [fa]], seed).winner === 1 ? 1 : 0
      fights += 2
    }
  }
  return { wins, fights }
}

const averageRate = (setId: string) => {
  let wins = 0
  let fights = 0
  for (const boss of BOSS_SETS) {
    const result = duel(setId, boss)
    wins += result.wins
    fights += result.fights
  }
  return wins / fights
}

describe('craft set balance gate', () => {
  jest.setTimeout(120_000)

  it('has 12 craft sets, each fighting 7 boss sets', () => {
    expect(CRAFT_SETS).toHaveLength(12)
    expect(BOSS_SETS).toHaveLength(7)
  })

  it.each(CRAFT_SETS.map(set => [set.id, set] as const))(
    '%s wins an even share against the boss sets',
    (_id, set) => {
      const [low, high] = bandOf(set)
      const rate = averageRate(set.id)
      expect(rate).toBeGreaterThanOrEqual(low)
      expect(rate).toBeLessThanOrEqual(high)
    }
  )
})
