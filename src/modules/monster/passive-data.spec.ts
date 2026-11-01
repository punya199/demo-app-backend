import {
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
  it('has 43 unique nodes, symmetric links and every node reachable from the hub', () => {
    expect(PASSIVE_NODES).toHaveLength(43)
    expect(new Set(PASSIVE_NODES.map(node => node.id)).size).toBe(43)
    for (const node of PASSIVE_NODES) {
      for (const other of node.adj) {
        expect(PASSIVE_NODES.find(n => n.id === other)!.adj).toContain(node.id)
      }
    }
    const everything = PASSIVE_NODES.filter(node => node.id !== PASSIVE_HUB).map(node => node.id)
    expect(isValidAllocation(everything)).toBe(true)
  })

  it('only allows taking a node next to the hub or an owned node', () => {
    expect(canAllocate([], 'flame-s0')).toBe(true)
    expect(canAllocate([], 'flame-s1')).toBe(false)
    expect(canAllocate(['flame-s0'], 'flame-s1')).toBe(true)
    expect(canAllocate(['flame-s0'], 'flame-s0')).toBe(false)
    expect(canAllocate([], 'nope')).toBe(false)
    expect(canAllocate([], PASSIVE_HUB)).toBe(false)
  })

  it('only allows dropping a node that keeps the rest connected', () => {
    const owned = ['flame-s0', 'flame-s1', 'flame-s2']
    expect(canDeallocate(owned, 'flame-s2')).toBe(true)
    expect(canDeallocate(owned, 'flame-s1')).toBe(false)
    expect(isValidAllocation(['flame-s1'])).toBe(false)
    expect(isValidAllocation(['flame-s0', 'flame-s0'])).toBe(false)
  })
})

describe('calcPassiveBonus', () => {
  it('maps stats, effects and keystone trade-offs onto the equipment bonus shape', () => {
    const { combat } = calcPassiveBonus(['flame-s0', 'flame-s1', 'flame-s2'])
    expect(combat.pct.atk).toBeCloseTo(0.12)
    expect(combat.effects).toEqual({ burnTurns: 1 })
    const keystone = calcPassiveBonus(['flame-s4']).combat.pct
    expect(keystone.atk).toBeCloseTo(0.25)
    expect(keystone.hp).toBeCloseTo(-0.2)
  })

  it('has no effects without passives, and caps the economy nodes at +15%', () => {
    const none = calcPassiveBonus([])
    expect(none.combat).toEqual(NO_EQUIPMENT_BONUS)
    expect(none.hungerDrainMultiplier).toBe(1)
    const rich = calcPassiveBonus([
      'tide-n0',
      'tide-n1',
      'tide-n2',
      'leaf-n0',
      'leaf-n1',
      'leaf-n2',
    ])
    expect(rich.expeditionCoinMultiplier).toBeCloseTo(1.15)
    expect(rich.equipmentDropMultiplier).toBeCloseTo(1.15)
  })

  it('slows hunger and adds effects on top of equipment', () => {
    expect(calcPassiveBonus(['flame-p0']).hungerDrainMultiplier).toBeCloseTo(0.95)
    const merged = mergeCombatBonus(
      { ...NO_EQUIPMENT_BONUS, effects: { burnTurns: 3, shieldPct: 0.15 } },
      calcPassiveBonus(['flame-s0', 'flame-s1', 'flame-s2', 'tide-s0']).combat
    )
    expect(merged.effects.burnTurns).toBe(4)
    expect(merged.effects.shieldPct).toBe(0.15)
    expect(merged.pct.hp).toBeCloseTo(0.04)
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
      })
    ).toBe(5 + 2 + 1 + 3 + 2 + 1)
    expect(
      calcPassivePoints({
        dexSpecies: 33,
        raidFirstClears: 9,
        worldBossDefeats: 30,
        pvpSeasonRanks: [],
      })
    ).toBe(60)
  })

  it('refunds the first 10 points free, then 1 gem each', () => {
    expect(calcRespecCost(0, 10)).toBe(0)
    expect(calcRespecCost(8, 5)).toBe(3)
    expect(calcRespecCost(12, 4)).toBe(4)
  })
})
