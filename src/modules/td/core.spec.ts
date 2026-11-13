import { BadRequestException, ConflictException } from '@nestjs/common'
import { CORE_RARITIES, CORE_SLOTS, ELEMENTS, STAGE_COUNT } from '../../libs/td-sim'
import { battleCores, coreGrantFor, planCoreEquip, planCorePromotion } from './core'
import { CORE_FIRST_CLEAR_GRANTS, CORE_PROMOTE_COSTS } from './core.config'

describe('core config', () => {
  it('has one rising, positive cost per promotion step', () => {
    expect(CORE_PROMOTE_COSTS).toHaveLength(CORE_RARITIES.length - 1)
    CORE_PROMOTE_COSTS.forEach((c, i) => {
      expect(c.coins).toBeGreaterThan(0)
      expect(c.shards).toBeGreaterThan(0)
      if (i > 0) {
        expect(c.coins).toBeGreaterThan(CORE_PROMOTE_COSTS[i - 1].coins)
        expect(c.shards).toBeGreaterThan(CORE_PROMOTE_COSTS[i - 1].shards)
      }
    })
  })

  it('grants one valid core per stage, matching the sim stage count', () => {
    expect(CORE_FIRST_CLEAR_GRANTS).toHaveLength(STAGE_COUNT)
    for (const g of CORE_FIRST_CLEAR_GRANTS) {
      expect(ELEMENTS).toContain(g.element)
      expect(CORE_RARITIES).toContain(g.rarity)
    }
  })
})

describe('planCorePromotion', () => {
  const rich = { coins: 1_000_000, shards: 1_000_000 }

  it('spends the configured materials and raises the rarity one tier', () => {
    expect(planCorePromotion('common', rich)).toEqual({
      cost: CORE_PROMOTE_COSTS[0],
      nextRarity: 'rare',
    })
    expect(planCorePromotion('epic', rich).nextRarity).toBe('legendary')
  })

  it('accepts exactly the price and rejects one short of either material', () => {
    const c = CORE_PROMOTE_COSTS[0]
    expect(planCorePromotion('common', c).nextRarity).toBe('rare')
    expect(() => planCorePromotion('common', { ...c, coins: c.coins - 1 })).toThrow(
      BadRequestException
    )
    expect(() => planCorePromotion('common', { ...c, shards: c.shards - 1 })).toThrow(
      BadRequestException
    )
  })

  it('rejects the top rarity and an unknown stored rarity, however rich the player is', () => {
    expect(() => planCorePromotion('legendary', rich)).toThrow(ConflictException)
    expect(() => planCorePromotion('mythic', rich)).toThrow(ConflictException)
  })
})

describe('planCoreEquip', () => {
  const cores = [
    { id: 'a', slot: 0 },
    { id: 'b', slot: 2 },
    { id: 'c', slot: null },
  ]

  it('equips into a free slot without displacing anyone', () => {
    expect(planCoreEquip('c', 1, cores)).toEqual({ displacedId: null })
  })

  it('unequips whoever holds the slot', () => {
    expect(planCoreEquip('c', 2, cores)).toEqual({ displacedId: 'b' })
  })

  it('re-equipping a core into its own slot displaces nobody', () => {
    expect(planCoreEquip('a', 0, cores)).toEqual({ displacedId: null })
  })

  it('any of the slots is allowed, and others are not', () => {
    for (let s = 0; s < CORE_SLOTS; s++) expect(() => planCoreEquip('c', s, cores)).not.toThrow()
    for (const s of [-1, CORE_SLOTS, 1.5, NaN, '1' as unknown as number])
      expect(() => planCoreEquip('c', s, cores)).toThrow(BadRequestException)
  })

  it('rejects a core the player does not own', () => {
    expect(() => planCoreEquip('zzz', 0, cores)).toThrow()
  })
})

describe('coreGrantFor', () => {
  it('is config-driven per stage and refuses an unknown stage', () => {
    for (let s = 1; s <= STAGE_COUNT; s++)
      expect(coreGrantFor(s)).toEqual(CORE_FIRST_CLEAR_GRANTS[s - 1])
    expect(() => coreGrantFor(0)).toThrow(BadRequestException)
    expect(() => coreGrantFor(STAGE_COUNT + 1)).toThrow(BadRequestException)
  })
})

describe('battleCores', () => {
  it('keeps only equipped cores, ordered by slot', () => {
    expect(
      battleCores([
        { slot: null, element: 'fire', rarity: 'common' },
        { slot: 3, element: 'ice', rarity: 'rare' },
        { slot: 0, element: 'nature', rarity: 'epic' },
      ])
    ).toEqual([
      { element: 'nature', rarity: 'epic' },
      { element: 'ice', rarity: 'rare' },
    ])
  })

  it('drops rows with an unknown element or rarity or a bad slot so a bad row cannot break the replay', () => {
    expect(
      battleCores([
        { slot: 0, element: 'wind', rarity: 'common' },
        { slot: 1, element: 'fire', rarity: 'mythic' },
        { slot: 9, element: 'fire', rarity: 'common' },
        { slot: 2, element: 'fire', rarity: 'common' },
      ])
    ).toEqual([{ element: 'fire', rarity: 'common' }])
  })

  it('is empty when nothing is equipped', () => {
    expect(battleCores([])).toEqual([])
  })
})
