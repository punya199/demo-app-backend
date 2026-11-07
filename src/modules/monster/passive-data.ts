import { IEquipmentBonus, NO_EQUIPMENT_BONUS } from './equipment-data'
import { IFighterEffects } from './battle-stats'

// Trainer passive tree: one per player, kept across monsters. Nodes are code (ids are stored, so
// never rename one); GET /passive publishes this graph, so the client only draws it.
// Effect values are percent points (3 = +3%), except `burn` (turns) and `firstStrike` / `noCrit`
// (flags: any value above 0 turns them on).

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
  | 'lifesteal'
  | 'thorns'
  | 'firstStrike'
  | 'noCrit'
export type IPassiveEffects = Partial<Record<PassiveEffectKey, number>>

export type EnumPassiveKind = 'small' | 'notable' | 'key' | 'mastery' | 'ascend'

export interface IPassiveNode {
  id: string
  name: string
  kind: EnumPassiveKind
  // Which arm it belongs to; bridge nodes sit between two arms.
  arm: ArmId | 'bridge' | 'ascend'
  fx: IPassiveEffects
  // Masteries: the player picks one of these (index 0..2); `fx` stays empty until they do.
  options?: { name: string; fx: IPassiveEffects }[]
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
  masteries: [string, [string, IPassiveEffects][]][]
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
    masteries: [
      [
        'Ember Craft',
        [
          ['Slow burn', { burn: 1 }],
          ['Hot blood', { atk: 8 }],
          ['Keen flame', { crit: 4 }],
        ],
      ],
      [
        'Pyre Rite',
        [
          ['Scorching edge', { critdmg: 20 }],
          ['Fury', { atk: 6, crit: 2 }],
          ['Stoked', { hp: 8 }],
        ],
      ],
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
      ['Undertow', { lifesteal: 15, spd: -15 }],
    ],
    masteries: [
      [
        'Deep Current',
        [
          ['Ward', { shield: 8 }],
          ['Siphon', { lifesteal: 5 }],
          ['Swell', { hp: 8 }],
        ],
      ],
      [
        'Reef Lore',
        [
          ['Armour', { def: 8 }],
          ['Mend', { regen: 1 }],
          ['Treasure', { expCoin: 6 }],
        ],
      ],
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
      ['Overgrowth', { regen: 3, noCrit: 1 }],
      ['Thorn Mantle', { thorns: 12, atk: -20 }],
    ],
    masteries: [
      [
        'Wild Growth',
        [
          ['Vigor', { regen: 1.5 }],
          ['Brambles', { thorns: 8 }],
          ['Gale', { spd: 6 }],
        ],
      ],
      [
        'Forager Rite',
        [
          ['Bounty', { drop: 6 }],
          ['Hardy', { hunger: 8 }],
          ['Twin shoots', { dbl: 6 }],
        ],
      ],
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
      ['Immovable', { hp: 30, def: 20, noCrit: 1 }],
    ],
    masteries: [
      [
        'Stone Lore',
        [
          ['Plating', { def: 8 }],
          ['Aegis', { shield: 6 }],
          ['Spikes', { thorns: 6 }],
        ],
      ],
      [
        'Hearth Rite',
        [
          ['Bulk', { hp: 8 }],
          ['Moss', { regen: 1 }],
          ['Feast', { hunger: 8 }],
        ],
      ],
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
      ['First Strike', { firstStrike: 1, hp: -20 }],
    ],
    masteries: [
      [
        'Static Field',
        [
          ['Charge', { spd: 6 }],
          ['Spark', { crit: 4 }],
          ['Echo', { dbl: 6 }],
        ],
      ],
      [
        'Storm Rite',
        [
          ['Thunderclap', { critdmg: 20 }],
          ['Surge', { atk: 6 }],
          ['Leech bolt', { lifesteal: 4 }],
        ],
      ],
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
      ['Soul Pact', { lifesteal: 25, hp: -30 }],
      ['Twilight Gambit', { dbl: 20, def: -30 }],
    ],
    masteries: [
      [
        'Veil Rite',
        [
          ['Drain', { lifesteal: 6 }],
          ['Echo strike', { dbl: 6 }],
          ['Spoils', { drop: 5 }],
        ],
      ],
      [
        'Soul Tithe',
        [
          ['Tribute', { expCoin: 6 }],
          ['Malice', { atk: 6 }],
          ['Shroud', { def: 6 }],
        ],
      ],
    ],
  },
]

// Ascendancy: three paths of 12 nodes outside the main tree, with their own point pool. Each path
// is a chain from `-00`; a player commits to one path and pays gems to start over.
export const ASCENDANCY_PATHS = ['vanguard', 'striker', 'warden'] as const
export type AscendancyPath = (typeof ASCENDANCY_PATHS)[number]
export const ASCENDANCY_LENGTH = 12
export const ASCENDANCY_MAX_POINTS = 12
export const ASCENDANCY_RESET_GEM_PRICE = 20
export const MASTERY_REPICK_GEM_PRICE = 1

const ASCENDANCY: Record<
  AscendancyPath,
  { small: IPassiveEffects[]; notable: IPassiveEffects[]; capstone: IPassiveEffects }
> = {
  vanguard: {
    small: [{ def: 3 }, { hp: 3 }, { shield: 2 }],
    notable: [
      { def: 6, hp: 4 },
      { shield: 5, hp: 5 },
    ],
    capstone: { def: 15, hp: 15, thorns: 10 },
  },
  striker: {
    small: [{ crit: 2 }, { dbl: 3 }, { spd: 3 }],
    notable: [
      { crit: 4, critdmg: 15 },
      { dbl: 6, spd: 5 },
    ],
    capstone: { crit: 8, critdmg: 30, dbl: 8 },
  },
  warden: {
    small: [{ regen: 0.5 }, { drop: 2 }, { expCoin: 2 }],
    notable: [
      { regen: 1, hp: 5 },
      { lifesteal: 4, burn: 1 },
    ],
    capstone: { regen: 2, lifesteal: 8, drop: 5 },
  },
}

export const ascendancyRoot = (path: AscendancyPath) => `v2-asc-${path}-00`
export const getAscendancyPath = (nodeId: string): AscendancyPath | null =>
  ASCENDANCY_PATHS.find(path => nodeId.startsWith(`v2-asc-${path}-`)) ?? null

// Balance knobs. Node values in the arm tables below are written at "face value"; the tree scales
// them so that a full 100-point build stays in line with what play progression expects (see
// passive-balance.spec.ts). Burn turns and the first strike / no crit flags are never scaled.
export const PASSIVE_POWER_SCALE = 0.5
export const PASSIVE_KEYSTONE_SCALE = 0.6
const UNSCALED: PassiveEffectKey[] = ['burn', 'firstStrike', 'noCrit']

// Regen is written in % of max HP per second: a node keeps its old per-turn weight (below), times
// this. 0.03 is exactly what the arena has always healed, and the boss balance guards sit right at
// that strength: 0.04 already lets a full sustain build outlast the cavern boss.
const REGEN_PER_SEC_PER_POINT = 0.03

// Rounded to the nearest 0.5 so tooltips stay readable, never below 0.5 for a positive value.
const scaleFx = (fx: IPassiveEffects, scale: number): IPassiveEffects =>
  Object.fromEntries(
    Object.entries(fx).map(([key, value]) => {
      if (UNSCALED.includes(key as PassiveEffectKey)) {
        return [key, value]
      }
      const scaled = Math.round(Math.abs(value) * scale * 2) / 2
      const weight = Math.max(0.5, scaled)
      if (key === 'regen') {
        return [
          key,
          Math.sign(value) * (Math.round(weight * REGEN_PER_SEC_PER_POINT * 1000) / 1000),
        ]
      }
      return [key, Math.sign(value) * weight]
    })
  )

export const PASSIVE_LANE_LENGTH = 16
// Spacing: nodes sit 34 apart along a lane, lanes fan out by 18 degrees, so no two nodes touch even
// with the largest frame (the keystone hexagon, 19 across).
const LANE_OFFSET = [-18, 0, 18]
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
      fx: scaleFx(fx, kind === 'key' ? PASSIVE_KEYSTONE_SCALE : PASSIVE_POWER_SCALE),
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
    add(`v2-ring-${pad(i)}`, 'Hub ring', 'small', 'bridge', { hp: 1 }, 68, (i * 360) / RING_SIZE)
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
        const radius = 120 + k * 34
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
          (lane === 0 ? 256 : 290) + k * 40.8,
          middle + (lane === 0 ? -3 : 3)
        )
        if (previous) {
          link(previous, id)
        }
        previous = id
      }
      if (lane === 0) {
        link(`v2-${arm.id}-2-04`, `v2-bridge-${armIndex}-0-00`)
        link(`v2-${next.id}-0-10`, `v2-bridge-${armIndex}-0-${pad(BRIDGE_LENGTH - 1)}`)
      } else {
        link(`v2-${arm.id}-2-05`, `v2-bridge-${armIndex}-1-00`)
        link(`v2-${next.id}-0-11`, `v2-bridge-${armIndex}-1-${pad(BRIDGE_LENGTH - 1)}`)
      }
    }
    link(`v2-bridge-${armIndex}-0-02`, `v2-bridge-${armIndex}-1-02`)
  })

  // Masteries sit between the lanes at index 8 and carry three options each.
  ARMS.forEach((arm, armIndex) => {
    const base = armIndex * 60 - 90
    arm.masteries.forEach(([name, options], index) => {
      const id = `v2-${arm.id}-m${index}`
      add(id, name, 'mastery', arm.id, {}, 430, base + (index === 0 ? -9 : 9))
      nodes.get(id)!.options = options.map(([optionName, fx]) => ({
        name: optionName,
        fx: scaleFx(fx, PASSIVE_POWER_SCALE),
      }))
      link(`v2-${arm.id}-${index === 0 ? 0 : 2}-08`, id)
      link(`v2-${arm.id}-1-08`, id)
    })
  })

  ASCENDANCY_PATHS.forEach((path, pathIndex) => {
    const def = ASCENDANCY[path]
    let previous = ''
    for (let k = 0; k < ASCENDANCY_LENGTH; k++) {
      const id = `v2-asc-${path}-${pad(k)}`
      const isNotable = k === 3 || k === 7
      const isCapstone = k === ASCENDANCY_LENGTH - 1
      const fx = isCapstone
        ? def.capstone
        : isNotable
          ? def.notable[k === 3 ? 0 : 1]
          : def.small[k % 3]
      add(
        id,
        `${path} ${isCapstone ? 'capstone' : isNotable ? 'notable' : 'node'}`,
        'ascend',
        'ascend',
        fx,
        780 + (k % 2) * 28,
        pathIndex * 120 + 30 - 27.5 + k * 5
      )
      if (previous) {
        link(previous, id)
      }
      previous = id
    }
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

export type MasteryPicks = Record<string, number>

// Ascendancy points: Nightmare raid first clears and world boss kills, 6 each at most.
export const calcAscendancyPoints = (progress: {
  nightmareClears: number
  worldBossDefeats: number
}) =>
  Math.min(
    ASCENDANCY_MAX_POINTS,
    Math.min(progress.nightmareClears, 6) + Math.min(progress.worldBossDefeats, 6)
  )

// A path's first node is free to take; the rest must touch an owned node. One path per player.
export const canAllocateAscendancy = (
  path: AscendancyPath | null,
  ids: string[],
  nodeId: string
) => {
  const nodePath = getAscendancyPath(nodeId)
  if (!nodePath || ids.includes(nodeId) || !NODES.has(nodeId)) {
    return false
  }
  if (ids.length > 0 && path !== nodePath) {
    return false
  }
  return nodeId === ascendancyRoot(nodePath) || NODES.get(nodeId)!.adj.some(id => ids.includes(id))
}

// A whole tree as the player edits it: saved in one go, or not at all.
export interface IPassiveDraft {
  nodeIds: string[]
  masteries: MasteryPicks
  ascendancyNodeIds: string[]
}

// Why a draft cannot be saved, or null when it can. `points` / `ascendancyPoints` are what the
// player has earned in each pool.
export const validatePassiveDraft = (
  draft: IPassiveDraft,
  limits: { points: number; ascendancyPoints: number }
): string | null => {
  if (!isValidAllocation(draft.nodeIds)) {
    return 'Those nodes are not one connected tree'
  }
  if (draft.nodeIds.length > limits.points) {
    return 'Not enough passive points'
  }
  const picked = Object.entries(draft.masteries)
  if (
    picked.some(([id, option]) => !draft.nodeIds.includes(id) || !isValidMasteryPick(id, option))
  ) {
    return 'Invalid mastery pick'
  }
  const asc = draft.ascendancyNodeIds
  if (asc.length) {
    const path = getAscendancyPath(asc[0])
    const owned = new Set(asc)
    if (!path || owned.size !== asc.length || asc.some(id => getAscendancyPath(id) !== path)) {
      return 'Ascendancy nodes must be unique and on one path'
    }
    // Every node must be reachable from the path's first node through owned nodes.
    const seen = new Set([ascendancyRoot(path)])
    const stack = [ascendancyRoot(path)]
    while (stack.length) {
      for (const id of NODES.get(stack.pop()!)?.adj ?? []) {
        if (owned.has(id) && !seen.has(id)) {
          seen.add(id)
          stack.push(id)
        }
      }
    }
    if (!owned.has(ascendancyRoot(path)) || asc.some(id => !seen.has(id))) {
      return 'Ascendancy nodes must be connected to the first node of the path'
    }
    if (asc.length > limits.ascendancyPoints) {
      return 'No ascendancy points left'
    }
  }
  return null
}

// Gems a save costs: points taken back beyond the free refunds, a changed mastery pick, and
// starting the ascendancy over (anything removed from it, or a different path).
export const calcPassiveSaveCost = (
  saved: IPassiveDraft,
  draft: IPassiveDraft,
  refundedPoints: number
) => {
  const kept = new Set(draft.nodeIds)
  const removed = saved.nodeIds.filter(id => !kept.has(id)).length
  const respec = calcRespecCost(refundedPoints, removed)
  const repicks = Object.entries(saved.masteries).filter(
    ([id, option]) =>
      kept.has(id) && draft.masteries[id] !== undefined && draft.masteries[id] !== option
  ).length
  const ascendancyReset =
    saved.ascendancyNodeIds.length > 0 &&
    saved.ascendancyNodeIds.some(id => !draft.ascendancyNodeIds.includes(id))
  return {
    removed,
    respec,
    repicks: repicks * MASTERY_REPICK_GEM_PRICE,
    ascendancyReset: ascendancyReset ? ASCENDANCY_RESET_GEM_PRICE : 0,
    total:
      respec +
      repicks * MASTERY_REPICK_GEM_PRICE +
      (ascendancyReset ? ASCENDANCY_RESET_GEM_PRICE : 0),
  }
}

export const isValidMasteryPick = (nodeId: string, option: number) => {
  const node = NODES.get(nodeId)
  return (
    node?.kind === 'mastery' &&
    Number.isInteger(option) &&
    option >= 0 &&
    option < (node.options?.length ?? 0)
  )
}

export const calcPassiveBonus = (
  ids: string[],
  picks: MasteryPicks = {},
  ascendancyIds: string[] = []
): IPassiveBonus => {
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
    lifesteal: 0,
    thorns: 0,
    firstStrike: 0,
    noCrit: 0,
  }
  const effectsOf = (id: string) => {
    const node = NODES.get(id)
    return { ...node?.fx, ...(node?.options?.[picks[id]]?.fx ?? {}) }
  }
  for (const id of [...ids, ...ascendancyIds]) {
    for (const [key, value] of Object.entries(effectsOf(id))) {
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
  setIf('lifesteal', sum.lifesteal / 100)
  setIf('thorns', sum.thorns / 100)
  setIf('firstStrike', sum.firstStrike > 0 ? 1 : 0)
  setIf('noCrit', sum.noCrit > 0 ? 1 : 0)
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
