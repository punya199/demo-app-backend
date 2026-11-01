import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { BEATS, getEffectiveness } from './battle-engine'
import { createEgg, tick } from './monster-engine'
import { NATURAL_LINES, RARE_EGG_LINES, SPECIES, SPIRITUAL_LINES } from './species-data'

const L = EnumMonsterLine

describe('element chart', () => {
  it('keeps the original triangle: flame > leaf > tide > flame', () => {
    expect(getEffectiveness(L.FLAME, L.LEAF)).toBe('strong')
    expect(getEffectiveness(L.LEAF, L.TIDE)).toBe('strong')
    expect(getEffectiveness(L.TIDE, L.FLAME)).toBe('strong')
    expect(getEffectiveness(L.LEAF, L.FLAME)).toBe('weak')
  })

  it('makes every natural element beat two and lose to two, and be normal to itself', () => {
    for (const line of NATURAL_LINES) {
      expect(BEATS[line]).toHaveLength(2)
      const losesTo = NATURAL_LINES.filter(other => BEATS[other].includes(line))
      expect(losesTo).toHaveLength(2)
      expect(getEffectiveness(line, line)).toBe('normal')
      for (const other of NATURAL_LINES) {
        if (BEATS[line].includes(other)) {
          expect(getEffectiveness(other, line)).toBe('weak')
        }
      }
    }
  })

  it('has the new matchups', () => {
    expect(getEffectiveness(L.EARTH, L.LIGHTNING)).toBe('strong')
    expect(getEffectiveness(L.LIGHTNING, L.TIDE)).toBe('strong')
    expect(getEffectiveness(L.TIDE, L.EARTH)).toBe('strong')
    expect(getEffectiveness(L.FLAME, L.EARTH)).toBe('strong')
    expect(getEffectiveness(L.LIGHTNING, L.FLAME)).toBe('strong')
  })
})

describe('spiritual chart', () => {
  it('is a triangle: holy > dark > shadow > holy', () => {
    expect(getEffectiveness(L.HOLY, L.DARK)).toBe('strong')
    expect(getEffectiveness(L.DARK, L.SHADOW)).toBe('strong')
    expect(getEffectiveness(L.SHADOW, L.HOLY)).toBe('strong')
    expect(getEffectiveness(L.DARK, L.HOLY)).toBe('weak')
  })

  it('is normal against every natural element, both ways', () => {
    for (const spirit of SPIRITUAL_LINES) {
      for (const natural of NATURAL_LINES) {
        expect(getEffectiveness(spirit, natural)).toBe('normal')
        expect(getEffectiveness(natural, spirit)).toBe('normal')
      }
    }
  })

  it('hatches from rare eggs only', () => {
    expect(RARE_EGG_LINES).toEqual(SPIRITUAL_LINES)
  })
})

describe('lines', () => {
  it.each([...NATURAL_LINES, ...SPIRITUAL_LINES])(
    '%s has the full 11-form tree, reachable from its egg',
    line => {
      const forms = SPECIES.filter(
        species => species.line === line && species.stage !== EnumMonsterStage.FUSED
      )
      expect(forms).toHaveLength(11)
      const ids = new Set(forms.map(form => form.id))
      const reached = new Set([`${line}_egg`])
      for (const id of reached) {
        forms
          .find(form => form.id === id)!
          .evolutions.forEach(rule => {
            expect(ids.has(rule.to)).toBe(true)
            reached.add(rule.to)
          })
      }
      expect(reached.size).toBe(11)
    }
  )

  it('hatches and grows an earth egg into a baby', () => {
    const egg = createEgg(L.EARTH, new Date('2026-01-01T00:00:00Z'))
    const grown = tick(egg, new Date('2026-01-01T00:10:00Z')).state
    expect(grown.speciesId).toBe('earth_baby1')
  })
})
