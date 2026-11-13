import { BadRequestException, ConflictException } from '@nestjs/common'
import { RELICS, RELIC_IDS } from '../../libs/td-sim'
import { battleRelics, planRelicUnlock, relicView } from './relic'
import { RELIC_UNLOCK_COSTS } from './relic.config'

const rich = { coins: 1_000_000, shards: 1_000_000 }
const witch = 'cinder-witch'

describe('relic config', () => {
  it('has a positive unlock cost for every relic', () => {
    expect(Object.keys(RELIC_UNLOCK_COSTS).sort()).toEqual([...RELIC_IDS].sort())
    for (const id of RELIC_IDS) {
      expect(RELIC_UNLOCK_COSTS[id].coins).toBeGreaterThan(0)
      expect(RELIC_UNLOCK_COSTS[id].shards).toBeGreaterThan(0)
    }
  })
})

describe('planRelicUnlock', () => {
  const own = { heroes: [witch], coreElements: ['fire'], unlocked: [] as string[] }

  it('returns the configured cost when hero, core and balances are there', () => {
    expect(planRelicUnlock('ember-brand', own, rich)).toEqual({
      cost: RELIC_UNLOCK_COSTS['ember-brand'],
    })
  })

  it('rejects an unknown relic', () => {
    expect(() => planRelicUnlock('nope', own, rich)).toThrow(BadRequestException)
  })

  it('rejects without the matching hero', () => {
    expect(() => planRelicUnlock('ember-brand', { ...own, heroes: ['archer'] }, rich)).toThrow(
      BadRequestException
    )
  })

  it('rejects without a core of the hero element, even with other cores', () => {
    expect(() => planRelicUnlock('ember-brand', { ...own, coreElements: ['ice'] }, rich)).toThrow(
      BadRequestException
    )
    expect(() => planRelicUnlock('ember-brand', { ...own, coreElements: [] }, rich)).toThrow(
      BadRequestException
    )
  })

  it('rejects a second unlock', () => {
    expect(() =>
      planRelicUnlock('ember-brand', { ...own, unlocked: ['ember-brand'] }, rich)
    ).toThrow(ConflictException)
  })

  it('rejects when coins or shards fall short by one', () => {
    const c = RELIC_UNLOCK_COSTS['ember-brand']
    expect(() =>
      planRelicUnlock('ember-brand', own, { coins: c.coins - 1, shards: c.shards })
    ).toThrow(BadRequestException)
    expect(() =>
      planRelicUnlock('ember-brand', own, { coins: c.coins, shards: c.shards - 1 })
    ).toThrow(BadRequestException)
    expect(planRelicUnlock('ember-brand', own, c).cost).toEqual(c)
  })
})

describe('battleRelics', () => {
  it('keeps known relics once each, in config order, and drops anything else', () => {
    expect(
      battleRelics([
        { relicId: 'void-shard' },
        { relicId: 'bogus' },
        { relicId: 'ember-brand' },
        { relicId: 'void-shard' },
      ])
    ).toEqual(['ember-brand', 'void-shard'])
    expect(battleRelics([])).toEqual([])
  })
})

describe('relicView', () => {
  it('shows eligibility and the cost for the screen', () => {
    const own = { heroes: [witch], coreElements: ['fire'], unlocked: ['frost-sigil'] }
    const ember = relicView('ember-brand', own)
    expect(ember).toEqual({
      id: 'ember-brand',
      hero: RELICS['ember-brand'].hero,
      element: 'fire',
      skill: RELICS['ember-brand'].skill,
      cost: RELIC_UNLOCK_COSTS['ember-brand'],
      unlocked: false,
      eligible: true,
    })
    expect(relicView('frost-sigil', own)).toMatchObject({ unlocked: true, eligible: false })
    expect(relicView('void-shard', own).eligible).toBe(false)
  })
})
