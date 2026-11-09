import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { toFighter } from '../battle/battle-stats'
import { createEgg, IMonsterState, tick } from './monster-engine'
import { assertCanMerge, assertMergeOpen, createFused } from './monster-merge'
import {
  CROSS_LINE_MERGE_ENABLED,
  FUSED_LIFESPAN_MINUTES,
  getLifespanMinutes,
  LIFESPAN_MINUTES,
  MERGE_POWER_MULTIPLIER,
} from './monster-rules'
import {
  FUSED_FORMS,
  fusedSpeciesId,
  getSpecies,
  NATURAL_LINES,
  SPIRITUAL_LINES,
  scaleStats,
  SPECIES,
  STAGE_BASE_STATS,
} from './species-data'

const NOW = new Date('2026-01-01T03:00:00Z')

const ultimate = (line: EnumMonsterLine, over: Partial<IMonsterState> = {}): IMonsterState => ({
  ...createEgg(line, NOW),
  speciesId: `${line}_ultimate`,
  stage: EnumMonsterStage.ULTIMATE,
  fullness: 4,
  strength: 2,
  weight: 44,
  wins: 9,
  ageMinutes: 1000,
  ...over,
})

describe('assertCanMerge', () => {
  const a = ultimate(EnumMonsterLine.FLAME)
  const b = ultimate(EnumMonsterLine.FLAME, { weight: 50 })

  it('accepts two healthy Ultimates of one line, either branch', () => {
    const alt = ultimate(EnumMonsterLine.FLAME, { speciesId: 'flame_ultimateAlt' })
    expect(() => assertCanMerge(a, b)).not.toThrow()
    expect(() => assertCanMerge(a, alt)).not.toThrow()
  })

  it('accepts two different lines now that cross-line merging is on', () => {
    expect(CROSS_LINE_MERGE_ENABLED).toBe(true)
    expect(() => assertMergeOpen(a, ultimate(EnumMonsterLine.TIDE))).not.toThrow()
    expect(() => assertMergeOpen(a, ultimate(EnumMonsterLine.LEAF))).not.toThrow()
    expect(() => assertMergeOpen(a, b)).not.toThrow()
  })

  it.each([
    ['not in the final form', { stage: EnumMonsterStage.PERFECT }, 'final form'],
    ['already fused', { stage: EnumMonsterStage.FUSED }, 'final form'],
    ['sick', { isSick: true }, 'sick'],
    ['on an expedition', { expeditionAreaId: 'meadow' }, 'expedition'],
    ['dead', { diedAt: NOW }, 'no longer alive'],
  ])('rejects a parent that is %s', (_label, over, message) => {
    expect(() => assertCanMerge(a, { ...b, ...over })).toThrow(message)
    expect(() => assertCanMerge({ ...a, ...over }, b)).toThrow(message)
  })
})

describe('fused forms', () => {
  it('has one form per line pair inside a group, found whatever the parent order', () => {
    const ids = new Set<string>()
    for (const group of [NATURAL_LINES, SPIRITUAL_LINES]) {
      for (const x of group) {
        for (const y of group) {
          expect(fusedSpeciesId(x, y)).toBe(fusedSpeciesId(y, x))
          ids.add(fusedSpeciesId(x, y))
        }
      }
    }
    // Natural: 5 awakened + 10 hybrids. Spiritual: 3 + 3. The original six ids keep their names.
    expect(ids.size).toBe(21)
    expect(ids).toContain('fused_flame_tide')
    expect(ids).toContain('fused_leaf_leaf')
    ids.forEach(id => expect(getSpecies(id).stage).toBe(EnumMonsterStage.FUSED))
    expect(SPECIES.filter(s => s.stage === EnumMonsterStage.FUSED)).toHaveLength(21)
  })

  it('refuses to merge a natural monster with a spiritual one', () => {
    const ultimate = (speciesId: string, line: EnumMonsterLine) => ({
      ...createEgg(line, NOW),
      speciesId,
      stage: EnumMonsterStage.ULTIMATE,
    })
    expect(() =>
      assertCanMerge(
        ultimate('flame_ultimate', EnumMonsterLine.FLAME),
        ultimate('holy_ultimate', EnumMonsterLine.HOLY)
      )
    ).toThrow('cannot be merged')
    expect(() =>
      assertCanMerge(
        ultimate('holy_ultimate', EnumMonsterLine.HOLY),
        ultimate('holy_ultimateAlt', EnumMonsterLine.HOLY)
      )
    ).not.toThrow()
  })

  it('never evolves', () => {
    expect(
      getSpecies(fusedSpeciesId(EnumMonsterLine.FLAME, EnumMonsterLine.TIDE)).evolutions
    ).toEqual([])
  })

  it('pins the Fused base stats to Ultimate x the merge multiplier', () => {
    expect(STAGE_BASE_STATS[EnumMonsterStage.FUSED]).toEqual(
      scaleStats(STAGE_BASE_STATS[EnumMonsterStage.ULTIMATE], MERGE_POWER_MULTIPLIER)
    )
  })

  it('averages the parents line lean for stats (awakened = the line itself)', () => {
    const awakened = getSpecies(fusedSpeciesId(EnumMonsterLine.FLAME, EnumMonsterLine.FLAME)).stats
    expect(awakened).toEqual({ hp: 195, atk: Math.round(39 * 1.15), def: 26, spd: 26 })
    const hybrid = getSpecies(fusedSpeciesId(EnumMonsterLine.FLAME, EnumMonsterLine.TIDE)).stats
    expect(hybrid.hp).toBe(Math.round(195 * ((1 + 1.15) / 2)))
    expect(hybrid.atk).toBe(Math.round(39 * ((1.15 + 1) / 2)))
  })
})

describe('createFused', () => {
  const flame = ultimate(EnumMonsterLine.FLAME)
  const tide = ultimate(EnumMonsterLine.TIDE, { fullness: 2, strength: 4, weight: 50 })

  it('starts a fresh fused life with reset counters and averaged care', () => {
    const fused = createFused(flame, tide, flame, NOW)
    expect(fused.speciesId).toBe(fusedSpeciesId(EnumMonsterLine.FLAME, EnumMonsterLine.TIDE))
    expect(fused.stage).toBe(EnumMonsterStage.FUSED)
    expect([fused.wins, fused.losses, fused.ageMinutes, fused.careMistakes]).toEqual([0, 0, 0, 0])
    expect([fused.fullness, fused.strength, fused.weight]).toEqual([3, 3, 47])
    expect(fused.bornAt).toBe(NOW)
    expect(fused.diedAt).toBeNull()
  })

  it('takes element and skill from the chosen base parent, whatever the order', () => {
    const fromFlame = toFighter(createFused(flame, tide, flame, NOW))
    const fromTide = toFighter(createFused(tide, flame, flame, NOW))
    const fromTideBase = toFighter(createFused(flame, tide, tide, NOW))
    expect(fromFlame.element).toBe(EnumMonsterLine.FLAME)
    expect(fromFlame.skill.name).toBe('สุริยะแผดเผา')
    expect(fromTide.stats).toEqual(fromFlame.stats)
    expect(fromTideBase.element).toBe(EnumMonsterLine.TIDE)
    expect(fromTideBase.skill.name).toBe('หอกเขาผลึก')
  })

  it('refuses parents that cannot merge', () => {
    expect(() => createFused(flame, { ...tide, isSick: true }, flame, NOW)).toThrow('sick')
  })
})

describe('fused life span', () => {
  it('lives 7 days, longer than the 5 of other forms', () => {
    expect(getLifespanMinutes(EnumMonsterStage.ULTIMATE)).toBe(LIFESPAN_MINUTES)
    expect(getLifespanMinutes(EnumMonsterStage.FUSED)).toBe(FUSED_LIFESPAN_MINUTES)
    expect(FUSED_LIFESPAN_MINUTES).toBe(7 * 24 * 60)
  })

  it('does not die of old age at 5 days, but does at 7, and never evolves', () => {
    const fused = createFused(
      ultimate(EnumMonsterLine.LEAF),
      ultimate(EnumMonsterLine.LEAF),
      ultimate(EnumMonsterLine.LEAF),
      NOW
    )
    const nearFive = { ...fused, ageMinutes: LIFESPAN_MINUTES - 1, fullness: 4, strength: 4 }
    const after = tick(nearFive, new Date(NOW.getTime() + 2 * 60_000)).state
    expect(after.diedAt).toBeNull()
    expect(after.speciesId).toBe(fused.speciesId)

    const nearSeven = { ...fused, ageMinutes: FUSED_LIFESPAN_MINUTES - 1, fullness: 4, strength: 4 }
    expect(tick(nearSeven, new Date(NOW.getTime() + 60_000)).state.diedAt).not.toBeNull()
  })
})

describe('hybrid fused forms', () => {
  it('gives every fused form its own pixel-art sprite, cross-line ones included', () => {
    const sprites = FUSED_FORMS.map(([a, b]) => getSpecies(fusedSpeciesId(a, b)).sprite)
    expect(sprites.every(Boolean)).toBe(true)
    expect(new Set(sprites).size).toBe(FUSED_FORMS.length)
    expect(getSpecies(fusedSpeciesId(EnumMonsterLine.TIDE, EnumMonsterLine.FLAME)).sprite).toBe(
      'hy_steam'
    )
  })
})
