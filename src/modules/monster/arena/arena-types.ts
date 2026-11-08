// Types for the real-time arena battle (skills, statuses, fighters, replay data).

export type ArenaLine =
  | 'flame'
  | 'tide'
  | 'leaf'
  | 'earth'
  | 'lightning'
  | 'holy'
  | 'dark'
  | 'shadow'
export type ArenaElement = ArenaLine | 'neutral'

export type StatusId =
  | 'burn'
  | 'poison'
  | 'slow'
  | 'root'
  | 'stun'
  | 'silence'
  | 'blind'
  | 'static'
  | 'atkDown'
  | 'defDown'
  | 'evaDown'
  | 'curse'
  | 'atkUp'
  | 'defUp'
  | 'haste'
  | 'regen'
  | 'evaUp'
  | 'focus'
  | 'immune'

export interface IArenaStatusInfo {
  label: string
  icon: string
  kind: 'buff' | 'debuff'
  // Hard crowd control: shares diminishing returns.
  cc?: boolean
  note: string
}

// A status a skill applies: to the target (default) or to the caster ('self'). ch = chance %.
export interface IArenaFx {
  st: StatusId
  dur: number
  ch: number
  to?: 'self'
  // Regen: % of max HP per second.
  val?: number
  // Buff size in % of the normal size (set by tuning when a buff's duration is capped).
  mag?: number
}

export interface IArenaPassive {
  rebirthPct?: number
  regenPct?: number
  damageCut?: number
  tenacity?: number
  moveCut?: number
  basicLifesteal?: number
  eva?: number
  dodgeCdCut?: number
  meleeRetort?: { power: number; st: StatusId; dur: number; ch: number }
  onBasic?: { st: StatusId; dur: number; ch: number }
  lastStand?: { belowPct: number; shield: number; immuneSec: number }
  enrage?: { belowPct: number; atk: number }
  afterDodge?: { critNext: boolean; bonus: number }
  // From gear and the trainer tree, never from a skill (see toArenaFighter).
  // Added to the crit multiplier, in percent points.
  critDamage?: number
  noCrit?: boolean
  // Chance % that a basic attack strikes again.
  doubleStrike?: number
  // % of max HP, kept until it is broken.
  startShield?: number
  // The basic attack and every skill are ready when the fight starts.
  firstStrike?: boolean
  // % of the HP lost to a hit that goes back to the attacker.
  thorns?: number
  // % cut to attack timing (basic attack and shared skill delay).
  attackSpeed?: number
  // World bosses: a shield in HP points, and ATK +atk% from `sec` seconds into the fight.
  flatShield?: number
  rage?: { sec: number; atk: number }
  // World bosses: one more stage at each of `secs` seconds into the fight, each adding atk% ATK and
  // def% DEF.
  grow?: { secs: number[]; atk: number; def: number }
  // Hits on a target with this status deal pct % more.
  bonusVsStatus?: { st: StatusId; pct: number }
  // A shield of pct % of max HP every `sec` seconds.
  shieldEvery?: { pct: number; sec: number }
  // % off every skill cooldown.
  cdCut?: number
  // Hits on a target below `belowPct` % HP deal pct % more (craft sets).
  executeVs?: { belowPct: number; pct: number }
  // More chance-based statuses on a basic attack, next to `onBasic` (craft sets).
  onBasicExtra?: { st: StatusId; dur: number; ch: number }[]
}

export interface IArenaDodge {
  cd: number
  chance: number
  parry?: number
  onDodge?: {
    haste?: number
    cleanse?: boolean
    blindAttacker?: number
    counter?: number
    vanish?: number
    critNext?: boolean
  }
}

export type ArenaSkillKind =
  | 'melee'
  | 'multi'
  | 'shot'
  | 'spread'
  | 'charge'
  | 'burst'
  | 'zone'
  | 'beam'
  | 'self'
  | 'passive'
  | 'dodge'

export interface IArenaSkill {
  id: string
  name: string
  icon: string
  el: ArenaElement
  // Species that unlocks it (its innate skill), or 'enemy' for adventure enemies.
  src: string
  slot: 'active' | 'passive' | 'dodge'
  kind: ArenaSkillKind
  // Seconds.
  cd: number
  // Ticks.
  wind?: number
  power?: number
  hits?: number
  range?: number
  radius?: number
  width?: number
  length?: number
  delay?: number
  fx?: IArenaFx[]
  heal?: number
  shield?: number
  shieldSec?: number
  cleanse?: boolean
  cleanseOnly?: StatusId[]
  execute?: number
  lifesteal?: number
  passive?: IArenaPassive
  dodge?: IArenaDodge
  note?: string
}

// An adventure stage's enemy (base stats come from the stage's level x strength x tuned k).
export interface IArenaStage {
  id: string
  name: string
  emoji: string
  // Pixel-art sprite id the client draws (the emoji is its fallback).
  sprite: string
  el: ArenaLine
  level: 'baby1' | 'baby2' | 'adult' | 'perfect' | 'ultimate'
  str: number | { hp: number; atk: number; def: number; spd: number }
  skills: string[]
  boss: boolean
}

// One fighter going into the arena, with its final stats (gear, care and trainer tree applied).
export interface IArenaFighterSpec {
  name: string
  emoji: string
  // Pixel-art sprite id; missing on NPCs and on snapshots stored before sprites (emoji then).
  sprite?: string | null
  element: ArenaLine
  hp: number
  atk: number
  def: number
  spd: number
  eva: number
  acc: number
  res: number
  // Added to the base crit chance (percent points).
  crit?: number
  // Innate first; active and passive skill ids.
  skills: string[]
  dodge: string | null
  boss?: boolean
  // A boss that still plays by the element triangle.
  usesElements?: boolean
  // Extra passive effects (from gear/trainer set effects).
  passive?: IArenaPassive
}

export interface IArenaEvent {
  t: number
  kind: string
  who?: number
  target?: number
  by?: number
  dmg?: number
  absorbed?: number
  crit?: boolean
  elem?: number
  skill?: string
  icon?: string
  x?: number
  y?: number
  x2?: number
  y2?: number
  r?: number
  w?: number
  el?: ArenaElement | null
  st?: StatusId
  dur?: number
  amount?: number
  parried?: boolean
  healed?: number
  reason?: 'ko' | 'time'
}

// Per tick: f = per fighter [x, y, hp, act, kind, actT, inv, face, shield, statusBits, dodgeCd,
// ...skillCooldowns]; p = projectiles [x, y, team, element]; z = zones [x, y, r, left, total, element].
export interface IArenaFrame {
  f: number[][]
  p: (number | string)[][]
  z: (number | string)[][]
}

export interface IArenaFighterSummary {
  idx: number
  team: number
  name: string
  emoji: string
  sprite: string | null
  el: ArenaLine
  maxHp: number
  hp: number
  dealt: number
  taken: number
  healed: number
  dodges: number
  casts: number
  skills: string[]
  allSlots: string[]
  dodge: string | null
  spd: number
  eva: number
  acc: number
  res: number
  boss: boolean
}

export interface IArenaResult {
  seed: number
  winner: number
  ticks: number
  frames: IArenaFrame[]
  events: IArenaEvent[]
  fighters: IArenaFighterSummary[]
  checksum: string
}
