import {
  branchOf,
  calcPassiveBonus,
  calcPassivePoints,
  calcRespecCost,
  canAllocate,
  canDeallocate,
  isValidAllocation,
  mergeCombatBonus,
  PASSIVE_HUB,
  PASSIVE_NODES,
} from './passive-data'
import { NO_EQUIPMENT_BONUS } from './equipment-data'

describe('passive graph', () => {
  const count = (kind: string) => PASSIVE_NODES.filter(node => node.kind === kind).length

  it('has about 370 unique nodes, symmetric links and every node reachable from the hub', () => {
    expect(PASSIVE_NODES).toHaveLength(373)
    expect(new Set(PASSIVE_NODES.map(node => node.id)).size).toBe(373)
    for (const node of PASSIVE_NODES) {
      for (const other of node.adj) {
        expect(PASSIVE_NODES.find(n => n.id === other)!.adj).toContain(node.id)
      }
    }
    const everything = PASSIVE_NODES.filter(node => node.id !== PASSIVE_HUB).map(node => node.id)
    expect(isValidAllocation(everything)).toBe(true)
  })

  it('has 12 keystones, and only keystones carry negative values', () => {
    expect(count('key')).toBe(12)
    for (const node of PASSIVE_NODES) {
      const hasNegative = Object.values(node.fx).some(value => value < 0)
      expect(hasNegative).toBe(node.kind === 'key' && hasNegative)
    }
    expect(
      PASSIVE_NODES.filter(n => n.kind === 'key').every(n => Object.values(n.fx).some(v => v < 0))
    ).toBe(true)
  })

  it('uses only v2 ids and no node is further than 600 from the hub', () => {
    expect(PASSIVE_NODES.filter(n => n.id !== PASSIVE_HUB).every(n => n.id.startsWith('v2-'))).toBe(
      true
    )
    expect(PASSIVE_NODES.every(n => Math.hypot(n.x, n.y) < 600)).toBe(true)
  })

  it('only allows taking a node next to the hub or an owned node', () => {
    expect(canAllocate([], 'v2-ring-00')).toBe(true)
    expect(canAllocate([], 'v2-flame-1-00')).toBe(false)
    expect(canAllocate(['v2-ring-09'], 'v2-flame-1-00')).toBe(true)
    expect(canAllocate(['v2-ring-09'], 'v2-ring-09')).toBe(false)
    expect(canAllocate([], 'nope')).toBe(false)
    expect(canAllocate([], PASSIVE_HUB)).toBe(false)
  })

  it('only allows dropping a node that keeps the rest connected', () => {
    const owned = ['v2-ring-09', 'v2-flame-1-00', 'v2-flame-1-01']
    expect(canDeallocate(owned, 'v2-flame-1-01')).toBe(true)
    expect(canDeallocate(owned, 'v2-flame-1-00')).toBe(false)
    expect(isValidAllocation(['v2-flame-1-00'])).toBe(false)
    expect(isValidAllocation(['v2-ring-09', 'v2-ring-09'])).toBe(false)
  })

  it('takes a whole branch: the node and everything cut off from the hub', () => {
    const owned = ['v2-ring-09', 'v2-flame-1-00', 'v2-flame-1-01', 'v2-ring-10']
    expect(branchOf(owned, 'v2-flame-1-00').sort()).toEqual(['v2-flame-1-00', 'v2-flame-1-01'])
    expect(branchOf(owned, 'v2-ring-10')).toEqual(['v2-ring-10'])
  })
})

describe('calcPassiveBonus', () => {
  it('maps stats, effects and keystone trade-offs onto the equipment bonus shape', () => {
    const { combat } = calcPassiveBonus(['v2-flame-0-00', 'v2-flame-0-01'])
    expect(combat.pct.atk).toBeCloseTo(0.04)
    const keystone = calcPassiveBonus(['v2-flame-0-15']).combat.pct
    expect(keystone.atk).toBeCloseTo(0.5)
    expect(keystone.def).toBeCloseTo(-0.4)
    expect(calcPassiveBonus(['v2-flame-2-15']).combat.effects).toEqual({ burnTurns: 2 })
  })

  it('has no effects without passives, and never drops a stat below -90%', () => {
    const none = calcPassiveBonus([])
    expect(none.combat).toEqual(NO_EQUIPMENT_BONUS)
    expect(none.hungerDrainMultiplier).toBe(1)
    const everyKeystone = PASSIVE_NODES.filter(node => node.kind === 'key').map(node => node.id)
    const { pct } = calcPassiveBonus(everyKeystone).combat
    expect(Math.min(pct.hp, pct.atk, pct.def, pct.spd)).toBeGreaterThanOrEqual(-0.9)
  })

  it('caps the economy nodes at +15%', () => {
    const everything = PASSIVE_NODES.map(node => node.id)
    const rich = calcPassiveBonus(everything)
    expect(rich.expeditionCoinMultiplier).toBeCloseTo(1.15)
    expect(rich.equipmentDropMultiplier).toBeCloseTo(1.15)
  })

  it('adds effects on top of equipment', () => {
    const merged = mergeCombatBonus(
      { ...NO_EQUIPMENT_BONUS, effects: { burnTurns: 3, shieldPct: 0.15 } },
      calcPassiveBonus(['v2-flame-2-15']).combat
    )
    expect(merged.effects.burnTurns).toBe(5)
    expect(merged.effects.shieldPct).toBe(0.15)
    expect(merged.pct.hp).toBeCloseTo(-0.2)
  })
})

describe('points and respec', () => {
  it('adds up play progress, with PvP by rank tier, up to the cap', () => {
    expect(
      calcPassivePoints({
        dexSpecies: 5,
        raidFirstClears: 2,
        worldBossDefeats: 1,
        pvpSeasonRanks: [1, 7, 40],
        adventureClears: 4,
        totalWins: 250,
      })
    ).toBe(5 + 2 + 1 + 3 + 2 + 1 + 4 + 2)
    expect(
      calcPassivePoints({
        dexSpecies: 33,
        raidFirstClears: 9,
        worldBossDefeats: 30,
        pvpSeasonRanks: [],
        adventureClears: 20,
        totalWins: 5000,
      })
    ).toBe(100)
  })

  it('refunds the first 10 points free, then 1 gem each', () => {
    expect(calcRespecCost(0, 10)).toBe(0)
    expect(calcRespecCost(8, 5)).toBe(3)
    expect(calcRespecCost(12, 4)).toBe(4)
  })
})
