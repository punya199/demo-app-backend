import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { MonsterRuleError } from '../core/monster-engine'
import { listingBlocker, marketFee, priceBand, referenceValue } from './market-rules'

const now = new Date('2026-01-01T00:00:00Z')
const pet = {
  stage: EnumMonsterStage.PERFECT,
  diedAt: null,
  expeditionAreaId: null,
  marketBoundUntil: null,
}

describe('market rules', () => {
  it('values higher stages and spiritual lines more', () => {
    const perfect = referenceValue(EnumMonsterStage.PERFECT, EnumMonsterLine.FLAME, null)
    const fused = referenceValue(EnumMonsterStage.FUSED, EnumMonsterLine.FLAME, null)
    const holy = referenceValue(EnumMonsterStage.PERFECT, EnumMonsterLine.HOLY, null)
    expect(perfect).toBe(30)
    expect(fused).toBeGreaterThan(perfect)
    expect(holy).toBeGreaterThan(perfect)
  })

  it('refuses a stage that can not be sold', () => {
    expect(() => referenceValue(EnumMonsterStage.ADULT, EnumMonsterLine.FLAME, null)).toThrow(
      MonsterRuleError
    )
  })

  it('keeps the price band at half to double and the fee at 10%', () => {
    expect(priceBand(30)).toEqual({ min: 15, max: 60 })
    expect(priceBand(1)).toEqual({ min: 1, max: 2 })
    expect(marketFee(100)).toBe(10)
    expect(marketFee(9)).toBe(0)
  })

  it('blocks young, away, gone and recently bought pets', () => {
    expect(listingBlocker(pet, now)).toBeNull()
    expect(listingBlocker({ ...pet, stage: EnumMonsterStage.ADULT }, now)).toMatch(/perfect/)
    expect(listingBlocker({ ...pet, expeditionAreaId: 'x' }, now)).toMatch(/expedition/)
    expect(listingBlocker({ ...pet, diedAt: now }, now)).toMatch(/gone/)
    expect(
      listingBlocker({ ...pet, marketBoundUntil: new Date(now.getTime() + 1000) }, now)
    ).toMatch(/resold/)
    expect(
      listingBlocker({ ...pet, marketBoundUntil: new Date(now.getTime() - 1000) }, now)
    ).toBeNull()
  })
})
