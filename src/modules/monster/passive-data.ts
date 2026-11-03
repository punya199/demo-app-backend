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
  arm: ArmId | 'bridge'
  fx: IPassiveEffects
  x: number
  y: number
  adj: string[]
}

export const PASSIVE_HUB = 'hub'
export const PASSIVE_MAX_POINTS = 100
// The first points taken back are free; after that each refunded point costs a gem.
export const PASSIVE_FREE_REFUNDS = 10
export const PASSIVE_RESPEC_GEM_PRICE = 1
// Taking back a whole branch never costs more than this many gems in one action.
export const PASSIVE_BRANCH_REFUND_CAP = 20
// Economy nodes can never add more than this much (percent) however many are taken.
export const PASSIVE_ECONOMY_CAP = 15

export type ArmId = 'flame' | 'tide' | 'leaf' | 'earth' | 'lightning' | 'spirit'

// Three lanes per arm (small stat nodes, a notable at index 5 and 10) and two keystones that close
// the outer lanes. Ids are `v2-<arm>-<lane>-<index>`, never rename one: they are stored per player.
interface IArmDef {
  id: ArmId
  lanes: { name: string; small: IPassiveEffects; notable: IPassiveEffects }[]
  keystones: [string, IPassiveEffects][]
  main: PassiveEffectKey
}

const ARMS: IArmDef[] = [
  {
    id: 'flame',
    main: 'atk',
    lanes: [
      { name: 'Ember Might', small: { atk: 2 }, notable: { atk: 5, hp: 2 } },
      { name: 'Searing Eye', small: { crit: 1 }, notable: { crit: 3, critdmg: 10 } },
      { name: 'Cinder Heart', small: { hp: 2 }, notable: { burn: 1, hp: 3 } },
    ],
    keystones: [
      ['Inferno Pact', { atk: 50, def: -40 }],
      ['Cinder Pyre', { burn: 2, hp: -20 }],
    ],
  },
  {
    id: 'tide',
    main: 'hp',
    lanes: [
      { name: 'Deep Pool', small: { hp: 2 }, notable: { hp: 5, def: 2 } },
      { name: 'Coral Plate', small: { def: 2 }, notable: { def: 5, shield: 2 } },
      { name: 'Tidal Barrier', small: { shield: 1 }, notable: { shield: 3, hp: 3 } },
    ],
    keystones: [
      ['Tidal Ward', { shield: 30, atk: -25 }],
      ['Deep Current', { hp: 35, spd: -20 }],
    ],
  },
  {
    id: 'leaf',
    main: 'spd',
    lanes: [
      { name: 'Quick Roots', small: { spd: 2 }, notable: { spd: 5, dbl: 3 } },
      { name: 'Evergreen', small: { regen: 0.5 }, notable: { regen: 1, hp: 3 } },
      { name: 'Lucky Forager', small: { drop: 2 }, notable: { drop: 4, spd: 2 } },
    ],
    keystones: [
      ['Overgrowth', { regen: 3, atk: -20 }],
      ['Wind Dancer', { spd: 30, def: -20 }],
    ],
  },
  {
    id: 'earth',
    main: 'def',
    lanes: [
      { name: 'Bedrock', small: { def: 2 }, notable: { def: 5, hp: 3 } },
      { name: 'Stone Heart', small: { hp: 2 }, notable: { hp: 5, regen: 0.5 } },
      { name: 'Hearty Appetite', small: { hunger: 2 }, notable: { hunger: 5, def: 3 } },
    ],
    keystones: [
      ['Bedrock Oath', { def: 40, spd: -30 }],
      ['Immovable', { hp: 30, def: 20, spd: -25 }],
    ],
  },
  {
    id: 'lightning',
    main: 'crit',
    lanes: [
      { name: 'Static', small: { spd: 2 }, notable: { spd: 5, crit: 2 } },
      { name: 'Overload', small: { crit: 1 }, notable: { crit: 3, critdmg: 12 } },
      { name: 'Twin Bolt', small: { dbl: 2 }, notable: { dbl: 5, atk: 3 } },
    ],
    keystones: [
      ['Overcharge', { critdmg: 60, def: -25 }],
      ['Storm Rush', { spd: 35, hp: -25 }],
    ],
  },
  {
    id: 'spirit',
    main: 'drop',
    lanes: [
      { name: 'Veil Strike', small: { atk: 1, def: 1 }, notable: { atk: 4, def: 3 } },
      { name: 'Pearl Tithe', small: { expCoin: 2 }, notable: { expCoin: 4, hp: 3 } },
      { name: 'Soul Harvest', small: { drop: 2 }, notable: { drop: 3, expCoin: 3 } },
    ],
    keystones: [
      ['Soul Pact', { atk: 30, hp: -30 }],
      ['Twilight Gambit', { dbl: 20, def: -30 }],
    ],
  },
]

export const PASSIVE_LANE_LENGTH = 16
const LANE_OFFSET = [-15, 0, 15]
const BRIDGE_LENGTH = 6
const RING_SIZE = 12

const round = (value: number) => Math.round(value * 10) / 10
const pad = (value: number) => String(value).padStart(2, '0')

const buildNodes = () => {
  const nodes = new Map<string, IPassiveNode>()
  const add = (
    id: string,
    name: string,
    kind: EnumPassiveKind,
    arm: IPassiveNode['arm'],
    fx: IPassiveEffects,
    radius: number,
    degrees: number
  ) => {
    const t = (degrees * Math.PI) / 180
    nodes.set(id, {
      id,
      name,
      kind,
      arm,
      fx,
      x: round(radius * Math.cos(t)),
      y: round(radius * Math.sin(t)),
      adj: [],
    })
    return id
  }
  const link = (a: string, b: string) => {
    nodes.get(a)!.adj.push(b)
    nodes.get(b)!.adj.push(a)
  }
  const double = (fx: IPassiveEffects): IPassiveEffects =>
    Object.fromEntries(Object.entries(fx).map(([key, value]) => [key, value * 2]))

  add(PASSIVE_HUB, 'Trainer hub', 'small', 'bridge', {}, 0, 0)
  for (let i = 0; i < RING_SIZE; i++) {
    add(`v2-ring-${pad(i)}`, 'Hub ring', 'small', 'bridge', { hp: 1 }, 55, (i * 360) / RING_SIZE)
    link(PASSIVE_HUB, `v2-ring-${pad(i)}`)
  }

  ARMS.forEach((arm, armIndex) => {
    const base = armIndex * 60 - 90
    arm.lanes.forEach((lane, laneIndex) => {
      let previous = ''
      for (let k = 0; k < PASSIVE_LANE_LENGTH; k++) {
        const id = `v2-${arm.id}-${laneIndex}-${pad(k)}`
        const sway = Math.sin(k * 0.7 + armIndex) * 2.2
        const angle = base + LANE_OFFSET[laneIndex] + sway
        const radius = 110 + k * 24
        if (k === PASSIVE_LANE_LENGTH - 1 && laneIndex !== 1) {
          const [name, fx] = arm.keystones[laneIndex === 0 ? 0 : 1]
          add(id, name, 'key', arm.id, fx, radius, angle)
        } else if (k === 5 || k === 10 || k === PASSIVE_LANE_LENGTH - 1) {
          add(
            id,
            lane.name,
            'notable',
            arm.id,
            k === 10 ? double(lane.notable) : lane.notable,
            radius,
            angle
          )
        } else {
          add(id, `${lane.name} +`, 'small', arm.id, lane.small, radius, angle)
        }
        if (previous) {
          link(previous, id)
        } else {
          const ring =
            ((Math.round((base + LANE_OFFSET[laneIndex]) / 30) % RING_SIZE) + RING_SIZE) % RING_SIZE
          link(`v2-ring-${pad(ring)}`, id)
        }
        previous = id
      }
    })
    // Cross-links between the three lanes every fourth node, so the arm is a mesh, not 3 strings.
    for (let k = 3; k < PASSIVE_LANE_LENGTH; k += 4) {
      link(`v2-${arm.id}-0-${pad(k)}`, `v2-${arm.id}-1-${pad(k)}`)
      link(`v2-${arm.id}-1-${pad(k)}`, `v2-${arm.id}-2-${pad(k)}`)
    }
  })

  // Bridges: two short parallel lanes from an arm's clockwise lane to the next arm's first lane.
  ARMS.forEach((arm, armIndex) => {
    const next = ARMS[(armIndex + 1) % ARMS.length]
    const middle = armIndex * 60 - 60
    for (let lane = 0; lane < 2; lane++) {
      let previous = ''
      for (let k = 0; k < BRIDGE_LENGTH; k++) {
        const id = `v2-bridge-${armIndex}-${lane}-${pad(k)}`
        const fx: IPassiveEffects = { [arm.main]: 1, [next.main]: 1 }
        const isNotable = k === 2 && lane === 0
        add(
          id,
          `${arm.id}/${next.id} bridge`,
          isNotable ? 'notable' : 'small',
          'bridge',
          isNotable ? double(fx) : fx,
          150 + k * 40,
          middle + (lane === 0 ? -4 : 4)
        )
        if (previous) {
          link(previous, id)
        }
        previous = id
      }
      if (lane === 0) {
        link(`v2-${arm.id}-2-02`, `v2-bridge-${armIndex}-0-00`)
        link(`v2-${next.id}-0-10`, `v2-bridge-${armIndex}-0-${pad(BRIDGE_LENGTH - 1)}`)
      } else {
        link(`v2-${arm.id}-2-03`, `v2-bridge-${armIndex}-1-00`)
        link(`v2-${next.id}-0-09`, `v2-bridge-${armIndex}-1-${pad(BRIDGE_LENGTH - 1)}`)
      }
    }
    link(`v2-bridge-${armIndex}-0-02`, `v2-bridge-${armIndex}-1-02`)
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

// One point per adventure stage cleared once (there are 20), and one per 100 total wins, up to 10.
export const PASSIVE_ADVENTURE_MAX_POINTS = 20
export const PASSIVE_WINS_PER_POINT = 100
export const PASSIVE_WIN_MAX_POINTS = 10

export const calcPassivePoints = (progress: {
  dexSpecies: number
  raidFirstClears: number
  worldBossDefeats: number
  pvpSeasonRanks: number[]
  adventureClears: number
  totalWins: number
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
      Math.min(progress.adventureClears, PASSIVE_ADVENTURE_MAX_POINTS) +
      Math.min(Math.floor(progress.totalWins / PASSIVE_WINS_PER_POINT), PASSIVE_WIN_MAX_POINTS) +
      progress.worldBossDefeats +
      pvp
  )
}

// `nodeId` and every owned node that is no longer connected to the hub once it is gone.
export const branchOf = (ids: string[], nodeId: string) => {
  const rest = new Set(ids)
  rest.delete(nodeId)
  const seen = reachableFromHub(rest)
  return ids.filter(id => !seen.has(id))
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
      // Trade-off keystones stack, so a stat can never drop below -90%.
      pct: {
        hp: Math.max(-0.9, sum.hp / 100),
        atk: Math.max(-0.9, sum.atk / 100),
        def: Math.max(-0.9, sum.def / 100),
        spd: Math.max(-0.9, sum.spd / 100),
      },
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
