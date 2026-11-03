import {
  branchOf,
  calcPassiveBonus,
  calcPassivePoints,
  calcRespecCost,
  canAllocate,
  canDeallocate,
  ascendancyRoot,
  calcAscendancyPoints,
  canAllocateAscendancy,
  isValidAllocation,
  isValidMasteryPick,
  mergeCombatBonus,
  PASSIVE_HUB,
  PASSIVE_NODES,
} from './passive-data'
import { NO_EQUIPMENT_BONUS } from './equipment-data'

describe('passive graph', () => {
  const main = PASSIVE_NODES.filter(node => node.kind !== 'ascend')
  const count = (kind: string) => PASSIVE_NODES.filter(node => node.kind === kind).length

  it('has 385 main nodes and 36 ascendancy nodes, symmetric links, all main nodes reachable', () => {
    expect(main).toHaveLength(385)
    expect(count('ascend')).toBe(36)
    expect(new Set(PASSIVE_NODES.map(node => node.id)).size).toBe(PASSIVE_NODES.length)
    for (const node of PASSIVE_NODES) {
      for (const other of node.adj) {
        expect(PASSIVE_NODES.find(n => n.id === other)!.adj).toContain(node.id)
      }
    }
    const everything = main.filter(node => node.id !== PASSIVE_HUB).map(node => node.id)
    expect(isValidAllocation(everything)).toBe(true)
    // Ascendancy is a separate map: it can never be taken through the main allocation.
    expect(isValidAllocation([ascendancyRoot('vanguard')])).toBe(false)
  })

  it('has 12 keystones that each carry a drawback, and only keystones have negative values', () => {
    expect(count('key')).toBe(12)
    for (const node of PASSIVE_NODES) {
      const hasNegative = Object.values(node.fx).some(value => value < 0)
      expect(hasNegative && node.kind !== 'key').toBe(false)
    }
    const drawback = (fx: Record<string, number>) =>
      Object.values(fx).some(value => value < 0) || !!fx.noCrit
    expect(PASSIVE_NODES.filter(n => n.kind === 'key').every(n => drawback(n.fx))).toBe(true)
  })

  it('uses only v2 ids and keeps the main tree inside 600 from the hub', () => {
    expect(PASSIVE_NODES.filter(n => n.id !== PASSIVE_HUB).every(n => n.id.startsWith('v2-'))).toBe(
      true
    )
    expect(main.every(n => Math.hypot(n.x, n.y) < 600)).toBe(true)
  })

  it('has 12 masteries with 3 options each and no effect until one is picked', () => {
    const masteries = PASSIVE_NODES.filter(node => node.kind === 'mastery')
    expect(masteries).toHaveLength(12)
    for (const node of masteries) {
      expect(node.options).toHaveLength(3)
      expect(node.fx).toEqual({})
    }
    expect(isValidMasteryPick('v2-flame-m0', 2)).toBe(true)
    expect(isValidMasteryPick('v2-flame-m0', 3)).toBe(false)
    expect(isValidMasteryPick('v2-flame-0-00', 0)).toBe(false)
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
    expect(combat.pct.atk).toBeCloseTo(0.02)
    const keystone = calcPassiveBonus(['v2-flame-0-15']).combat.pct
    expect(keystone.atk).toBeCloseTo(0.4)
    expect(keystone.def).toBeCloseTo(-0.32)
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
    expect(merged.pct.hp).toBeCloseTo(-0.16)
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

describe('masteries and ascendancy', () => {
  it('adds the picked mastery option to the bonus, and nothing without a pick', () => {
    const ids = ['v2-flame-m0']
    expect(calcPassiveBonus(ids).combat.pct.atk).toBe(0)
    expect(calcPassiveBonus(ids, { 'v2-flame-m0': 1 }).combat.pct.atk).toBeCloseTo(0.04)
    expect(calcPassiveBonus(ids, { 'v2-flame-m0': 0 }).combat.effects).toEqual({ burnTurns: 1 })
  })

  it('applies keystone effects: lifesteal, thorns, first strike and no crit', () => {
    const { effects } = calcPassiveBonus(['v2-tide-2-15', 'v2-leaf-2-15']).combat
    expect(effects.lifesteal).toBeCloseTo(0.12)
    expect(effects.thorns).toBeCloseTo(0.16)
    expect(calcPassiveBonus(['v2-lightning-2-15']).combat.effects.firstStrike).toBe(1)
    expect(calcPassiveBonus(['v2-earth-2-15']).combat.effects.noCrit).toBe(1)
  })

  it('lets a path start at its first node and grow along the chain, one path only', () => {
    const root = ascendancyRoot('striker')
    expect(canAllocateAscendancy(null, [], root)).toBe(true)
    expect(canAllocateAscendancy(null, [], 'v2-asc-striker-01')).toBe(false)
    expect(canAllocateAscendancy('striker', [root], 'v2-asc-striker-01')).toBe(true)
    expect(canAllocateAscendancy('striker', [root], 'v2-asc-warden-00')).toBe(false)
    expect(canAllocateAscendancy('striker', [root], root)).toBe(false)
    expect(canAllocateAscendancy(null, [], 'v2-ring-00')).toBe(false)
  })

  it('adds ascendancy nodes to the bonus', () => {
    const { combat } = calcPassiveBonus([], {}, ['v2-asc-striker-00', 'v2-asc-striker-01'])
    expect(combat.effects.critChance).toBeCloseTo(0.01)
    expect(combat.effects.doubleStrikeChance).toBeCloseTo(0.015)
  })

  it('earns ascendancy points from nightmare clears and boss kills, 6 each, 12 in total', () => {
    expect(calcAscendancyPoints({ nightmareClears: 2, worldBossDefeats: 3 })).toBe(5)
    expect(calcAscendancyPoints({ nightmareClears: 20, worldBossDefeats: 20 })).toBe(12)
    expect(calcAscendancyPoints({ nightmareClears: 0, worldBossDefeats: 0 })).toBe(0)
  })
})
