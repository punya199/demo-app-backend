import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { toFighter } from './battle-stats'
import { createEgg, IMonsterState, tick } from './monster-engine'
import { assertCanMerge, createFused } from './monster-merge'
import {
  FUSED_LIFESPAN_MINUTES,
  getLifespanMinutes,
  LIFESPAN_MINUTES,
  MERGE_POWER_MULTIPLIER,
} from './monster-rules'
import { fusedSpeciesId, getSpecies, scaleStats, SPECIES, STAGE_BASE_STATS } from './species-data'

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
  const b = ultimate(EnumMonsterLine.TIDE)

  it('accepts two healthy Ultimates, either branch', () => {
    const alt = ultimate(EnumMonsterLine.LEAF, { speciesId: 'leaf_ultimateAlt' })
    expect(() => assertCanMerge(a, b)).not.toThrow()
    expect(() => assertCanMerge(a, alt)).not.toThrow()
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
  it('has one form per line pair, found whatever the parent order', () => {
    const lines = Object.values(EnumMonsterLine)
    const ids = new Set<string>()
    for (const x of lines) {
      for (const y of lines) {
        expect(fusedSpeciesId(x, y)).toBe(fusedSpeciesId(y, x))
        ids.add(fusedSpeciesId(x, y))
      }
    }
    expect(ids.size).toBe(6)
    ids.forEach(id => expect(getSpecies(id).stage).toBe(EnumMonsterStage.FUSED))
    expect(SPECIES.filter(s => s.stage === EnumMonsterStage.FUSED)).toHaveLength(6)
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
    expect(fromTideBase.skill.name).toBe('ตรีศูลสมุทร')
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
