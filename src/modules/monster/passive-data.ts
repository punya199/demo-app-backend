import { IEquipmentBonus, NO_EQUIPMENT_BONUS } from './equipment-data'
import { IFighterEffects } from './battle-stats'

// Trainer passive tree: one per player, kept across monsters. Nodes are code (ids are stored, so
// never rename one); GET /passive publishes this graph, so the client only draws it.
// Effect values are percent points (3 = +3%), except `burn` (turns).

export type PassiveEffectKey =
  | 'atk'
  | 'hp'
  | 'def'
  | 'spd'
  | 'crit'
  | 'critdmg'
  | 'shield'
  | 'regen'
  | 'dbl'
  | 'burn'
  | 'hunger'
  | 'expCoin'
  | 'drop'
export type IPassiveEffects = Partial<Record<PassiveEffectKey, number>>

export type EnumPassiveKind = 'small' | 'notable' | 'key'

export interface IPassiveNode {
  id: string
  name: string
  kind: EnumPassiveKind
  // Which arm it belongs to; bridge nodes sit between two arms.
  arm: 'flame' | 'tide' | 'leaf' | 'bridge'
  fx: IPassiveEffects
  x: number
  y: number
  adj: string[]
}

export const PASSIVE_HUB = 'hub'
export const PASSIVE_MAX_POINTS = 60
// The first points taken back are free; after that each refunded point costs a gem.
export const PASSIVE_FREE_REFUNDS = 10
export const PASSIVE_RESPEC_GEM_PRICE = 1
// Economy nodes can never add more than this much (percent) however many are taken.
export const PASSIVE_ECONOMY_CAP = 15

type NodeDef = [string, IPassiveEffects]
interface IArmDef {
  id: 'flame' | 'tide' | 'leaf'
  angle: number
  spine: NodeDef[]
  // Side branch toward the previous arm, and toward the next one (clockwise).
  prev: NodeDef[]
  next: NodeDef[]
}

const ARMS: IArmDef[] = [
  {
    id: 'flame',
    angle: -90,
    spine: [
      ['Ember Spark', { atk: 3 }],
      ['Kindled Fury', { atk: 3 }],
      ['Ember Heart', { atk: 6, burn: 1 }],
      ['Searing Edge', { atk: 3 }],
      ['Glass Cannon', { atk: 25, hp: -20 }],
    ],
    prev: [
      ['Hearty Appetite', { hunger: 5 }],
      ['Hearty Appetite', { hunger: 5 }],
      ['Well Fed Fury', { atk: 8, hunger: 5 }],
    ],
    next: [
      ['Sharp Eye', { crit: 2 }],
      ['Sharp Eye', { crit: 2 }],
      ['Killer Instinct', { crit: 4, critdmg: 15 }],
    ],
  },
  {
    id: 'tide',
    angle: 30,
    spine: [
      ['Deep Pool', { hp: 4 }],
      ['Deep Pool', { hp: 4 }],
      ['Tidal Heart', { hp: 8, def: 4 }],
      ['Coral Plating', { def: 4 }],
      ['Bulwark', { def: 30, spd: -15 }],
    ],
    prev: [
      ['Water Ward', { shield: 2 }],
      ['Water Ward', { shield: 2 }],
      ['Tidal Barrier', { shield: 6 }],
    ],
    next: [
      ['Pearl Diver', { expCoin: 5 }],
      ['Pearl Diver', { expCoin: 5 }],
      ['Deep Treasure', { expCoin: 10 }],
    ],
  },
  {
    id: 'leaf',
    angle: 150,
    spine: [
      ['Light Step', { spd: 3 }],
      ['Quick Roots', { spd: 3 }],
      ['Twin Strike', { spd: 6, dbl: 8 }],
      ['Gale Shoots', { spd: 3 }],
      ['Wind Dancer', { spd: 25, def: -15 }],
    ],
    prev: [
      ['Sap Flow', { regen: 0.5 }],
      ['Sap Flow', { regen: 0.5 }],
      ['Evergreen', { regen: 1.5 }],
    ],
    next: [
      ['Lucky Forager', { drop: 5 }],
      ['Lucky Forager', { drop: 5 }],
      ['Rich Harvest', { drop: 10 }],
    ],
  },
]

// Hybrid chains between an arm's `next` branch and the following arm's `prev` branch.
const BRIDGES: NodeDef[][] = [
  [
    ['Steam', { atk: 2, def: 2 }],
    ['Steam Veil', { atk: 5, def: 5 }],
    ['Steam', { atk: 2, def: 2 }],
  ],
  [
    ['Marsh', { hp: 3, regen: 0.5 }],
    ['Mangrove', { hp: 6, regen: 1 }],
    ['Marsh', { hp: 3, regen: 0.5 }],
  ],
  [
    ['Ash', { spd: 2, atk: 2 }],
    ['Wildfire', { spd: 5, burn: 1 }],
    ['Ash', { spd: 2, atk: 2 }],
  ],
]

const SPINE_RADIUS = [100, 150, 200, 260, 310]
const SPINE_KIND: EnumPassiveKind[] = ['small', 'small', 'notable', 'small', 'key']
const BRANCH_RADIUS = [170, 215, 265]
const BRANCH_OFFSET = [45, 70, 85]
const BRIDGE_RADIUS = 300

const round = (value: number) => Math.round(value * 10) / 10

const buildNodes = () => {
  const nodes = new Map<string, IPassiveNode>()
  const add = (
    id: string,
    name: string,
    kind: EnumPassiveKind,
    arm: IPassiveNode['arm'],
    fx: IPassiveEffects,
    x: number,
    y: number
  ) => nodes.set(id, { id, name, kind, arm, fx, x: round(x), y: round(y), adj: [] })
  const link = (a: string, b: string) => {
    nodes.get(a)!.adj.push(b)
    nodes.get(b)!.adj.push(a)
  }
  const place = (angle: number, radius: number, lateral: number) => {
    const t = (angle * Math.PI) / 180
    return [
      radius * Math.cos(t) - lateral * Math.sin(t),
      radius * Math.sin(t) + lateral * Math.cos(t),
    ]
  }

  add(PASSIVE_HUB, 'Trainer hub', 'small', 'bridge', {}, 0, 0)

  for (const arm of ARMS) {
    arm.spine.forEach(([name, fx], index) => {
      const [x, y] = place(arm.angle, SPINE_RADIUS[index], 0)
      add(`${arm.id}-s${index}`, name, SPINE_KIND[index], arm.id, fx, x, y)
      link(index === 0 ? PASSIVE_HUB : `${arm.id}-s${index - 1}`, `${arm.id}-s${index}`)
    })
    for (const [letter, branch, side] of [
      ['p', arm.prev, -1],
      ['n', arm.next, 1],
    ] as const) {
      branch.forEach(([name, fx], index) => {
        const [x, y] = place(arm.angle, BRANCH_RADIUS[index], side * BRANCH_OFFSET[index])
        add(
          `${arm.id}-${letter}${index}`,
          name,
          index === 2 ? 'notable' : 'small',
          arm.id,
          fx,
          x,
          y
        )
        link(
          index === 0 ? `${arm.id}-s1` : `${arm.id}-${letter}${index - 1}`,
          `${arm.id}-${letter}${index}`
        )
      })
    }
  }

  ARMS.forEach((arm, armIndex) => {
    const next = ARMS[(armIndex + 1) % ARMS.length]
    const from = nodes.get(`${arm.id}-n2`)!
    const to = nodes.get(`${next.id}-p2`)!
    const a0 = Math.atan2(from.y, from.x)
    let a1 = Math.atan2(to.y, to.x)
    if (a1 < a0) {
      a1 += Math.PI * 2
    }
    let previous = from.id
    BRIDGES[armIndex].forEach(([name, fx], index) => {
      const t = a0 + ((a1 - a0) * (index + 1)) / 4
      const id = `bridge${armIndex}-${index}`
      add(
        id,
        name,
        index === 1 ? 'notable' : 'small',
        'bridge',
        fx,
        BRIDGE_RADIUS * Math.cos(t),
        BRIDGE_RADIUS * Math.sin(t)
      )
      link(previous, id)
      previous = id
    })
    link(previous, to.id)
  })
  return nodes
}

const NODES = buildNodes()
export const PASSIVE_NODES: IPassiveNode[] = [...NODES.values()]
export const getPassiveNode = (id: string) => NODES.get(id)

// Nodes of `owned` (hub excluded) that can be reached from the hub through owned nodes.
const reachableFromHub = (owned: Set<string>) => {
  const seen = new Set<string>([PASSIVE_HUB])
  const stack = [PASSIVE_HUB]
  while (stack.length) {
    for (const id of NODES.get(stack.pop()!)!.adj) {
      if (owned.has(id) && !seen.has(id)) {
        seen.add(id)
        stack.push(id)
      }
    }
  }
  return seen
}

export const isValidAllocation = (ids: string[]) => {
  const owned = new Set(ids)
  return (
    owned.size === ids.length &&
    ids.every(id => id !== PASSIVE_HUB && NODES.has(id)) &&
    ids.every(id => reachableFromHub(owned).has(id))
  )
}

export const canAllocate = (ids: string[], nodeId: string) => {
  const node = NODES.get(nodeId)
  return (
    !!node &&
    nodeId !== PASSIVE_HUB &&
    !ids.includes(nodeId) &&
    node.adj.some(id => id === PASSIVE_HUB || ids.includes(id))
  )
}

// A node can go only when everything else you own stays connected to the hub.
export const canDeallocate = (ids: string[], nodeId: string) =>
  ids.includes(nodeId) && isValidAllocation(ids.filter(id => id !== nodeId))

// Points earned from play. Dex species 1 each, first Raid clears 1 each, World Boss defeats 1
// each, and each finished PvP season you qualified for 1-3 by final rank.
export const PVP_SEASON_POINTS = [
  { maxRank: 3, points: 3 },
  { maxRank: 10, points: 2 },
  { maxRank: null, points: 1 },
]

// Dex species pay 1 point each, up to this many (more species than this are collectible).
export const PASSIVE_DEX_MAX_POINTS = 33

export const calcPassivePoints = (progress: {
  dexSpecies: number
  raidFirstClears: number
  worldBossDefeats: number
  pvpSeasonRanks: number[]
}) => {
  const pvp = progress.pvpSeasonRanks.reduce(
    (sum, rank) =>
      sum + PVP_SEASON_POINTS.find(tier => tier.maxRank === null || rank <= tier.maxRank)!.points,
    0
  )
  return Math.min(
    PASSIVE_MAX_POINTS,
    Math.min(progress.dexSpecies, PASSIVE_DEX_MAX_POINTS) +
      progress.raidFirstClears +
      progress.worldBossDefeats +
      pvp
  )
}

// How many gems taking back `count` points costs, given how many were already taken back.
export const calcRespecCost = (alreadyRefunded: number, count: number) =>
  (Math.max(0, alreadyRefunded + count - PASSIVE_FREE_REFUNDS) -
    Math.max(0, alreadyRefunded - PASSIVE_FREE_REFUNDS)) *
  PASSIVE_RESPEC_GEM_PRICE

export interface IPassiveBonus {
  // Stats and battle effects, in the shape equipment already uses.
  combat: IEquipmentBonus
  // Fullness drains this much as fast (1 = unchanged).
  hungerDrainMultiplier: number
  expeditionCoinMultiplier: number
  equipmentDropMultiplier: number
}

export const calcPassiveBonus = (ids: string[]): IPassiveBonus => {
  const sum: Record<PassiveEffectKey, number> = {
    atk: 0,
    hp: 0,
    def: 0,
    spd: 0,
    crit: 0,
    critdmg: 0,
    shield: 0,
    regen: 0,
    dbl: 0,
    burn: 0,
    hunger: 0,
    expCoin: 0,
    drop: 0,
  }
  for (const id of ids) {
    for (const [key, value] of Object.entries(NODES.get(id)?.fx ?? {})) {
      sum[key as PassiveEffectKey] += value
    }
  }
  const effects: IFighterEffects = {}
  const setIf = <K extends keyof IFighterEffects>(key: K, value: number) => {
    if (value) {
      effects[key] = value as IFighterEffects[K]
    }
  }
  setIf('burnTurns', sum.burn)
  setIf('doubleStrikeChance', sum.dbl / 100)
  setIf('shieldPct', sum.shield / 100)
  setIf('regenPct', sum.regen / 100)
  setIf('critChance', sum.crit / 100)
  setIf('critDamage', sum.critdmg / 100)
  return {
    combat: {
      flat: { ...NO_EQUIPMENT_BONUS.flat },
      pct: { hp: sum.hp / 100, atk: sum.atk / 100, def: sum.def / 100, spd: sum.spd / 100 },
      effects,
    },
    hungerDrainMultiplier: 1 - Math.min(sum.hunger, 100) / 100,
    expeditionCoinMultiplier: 1 + Math.min(sum.expCoin, PASSIVE_ECONOMY_CAP) / 100,
    equipmentDropMultiplier: 1 + Math.min(sum.drop, PASSIVE_ECONOMY_CAP) / 100,
  }
}

// Passive combat bonus on top of equipment. Effects add up (equipment burn 3 + passive 1 = 4).
export const mergeCombatBonus = (
  equipment: IEquipmentBonus,
  passive: IEquipmentBonus
): IEquipmentBonus => {
  const effects: IFighterEffects = { ...equipment.effects }
  for (const [key, value] of Object.entries(passive.effects) as [keyof IFighterEffects, number][]) {
    effects[key] = (effects[key] ?? 0) + value
  }
  const pct = { ...equipment.pct }
  for (const key of ['hp', 'atk', 'def', 'spd'] as const) {
    pct[key] += passive.pct[key]
  }
  return { flat: equipment.flat, pct, effects }
}
