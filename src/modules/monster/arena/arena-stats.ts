import { ARENA_HP_SCALE } from './arena-rules'
import { IArenaFighterSpec, StatusId } from './arena-types'

// The arena-only numbers of a pet for its status screen: what `toArenaFighter` feeds the fight
// (line EVA/ACC/RES, gear and trainer-tree passives). Zero / false / null = the pet has none.
export interface IArenaStatsView {
  // HP as it is in a fight (the sheet HP x the line's arena lean x ARENA_HP_SCALE).
  fightHp: number
  eva: number
  acc: number
  res: number
  // Offensive: percents unless noted.
  attackSpeed: number
  cdCut: number
  doubleStrike: number
  firstStrike: boolean
  executeBonus: number
  burnChance: number
  burnBonus: number
  poisonBonus: number
  // Chance-based statuses a basic attack applies (percent).
  onBasic: { status: StatusId; chance: number }[]
  afterDodgeBonus: number
  noCrit: boolean
  // Defensive.
  regenPct: number
  // HP regained per second at the fight HP above.
  regenPerSec: number
  lifesteal: number
  thorns: number
  damageCut: number
  startShield: number
  periodicShield: { pct: number; sec: number } | null
  lastStand: { belowPct: number; shield: number } | null
  dodgeCdCut: number
  retort: number
}

export const toArenaStatsView = (spec: IArenaFighterSpec): IArenaStatsView => {
  const p = spec.passive ?? {}
  const fightHp = Math.round(spec.hp * ARENA_HP_SCALE)
  const regenPct = p.regenPct ?? 0
  const bonusVs = (status: StatusId) => (p.bonusVsStatus?.st === status ? p.bonusVsStatus.pct : 0)
  const burn = p.onBasic?.st === 'burn' ? p.onBasic : null
  const statuses = [...(p.onBasic && !burn ? [p.onBasic] : []), ...(p.onBasicExtra ?? [])]
  return {
    fightHp,
    eva: spec.eva,
    acc: spec.acc,
    res: spec.res,
    attackSpeed: p.attackSpeed ?? 0,
    cdCut: p.cdCut ?? 0,
    doubleStrike: p.doubleStrike ?? 0,
    firstStrike: !!p.firstStrike,
    executeBonus: p.executeVs?.pct ?? 0,
    burnChance: burn?.ch ?? 0,
    burnBonus: bonusVs('burn'),
    poisonBonus: bonusVs('poison'),
    onBasic: statuses.map(entry => ({ status: entry.st, chance: entry.ch })),
    afterDodgeBonus: p.afterDodge?.bonus ?? 0,
    noCrit: !!p.noCrit,
    regenPct,
    regenPerSec: Math.round(((fightHp * regenPct) / 100) * 10) / 10,
    lifesteal: p.basicLifesteal ?? 0,
    thorns: p.thorns ?? 0,
    damageCut: p.damageCut ?? 0,
    startShield: p.startShield ?? 0,
    periodicShield: p.shieldEvery ? { pct: p.shieldEvery.pct, sec: p.shieldEvery.sec } : null,
    lastStand: p.lastStand ? { belowPct: p.lastStand.belowPct, shield: p.lastStand.shield } : null,
    dodgeCdCut: p.dodgeCdCut ?? 0,
    retort: p.meleeRetort?.ch ?? 0,
  }
}
