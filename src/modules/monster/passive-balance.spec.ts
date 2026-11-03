import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { ADVENTURE_AREAS } from './adventure-data'
import { simulateBattle } from './battle-engine'
import { IFighter } from './battle-stats'
import { capEffects } from './monster-potential'
import {
  calcPassiveBonus,
  IPassiveEffects,
  IPassiveNode,
  MasteryPicks,
  PASSIVE_HUB,
  PASSIVE_MAX_POINTS,
  PASSIVE_NODES,
} from './passive-data'
import { STAGE_BASE_STATS } from './species-data'

// A balance guard, not a unit test: it builds a full 100-point build per playstyle, fights the five
// area bosses with it and checks the win rates stay in the intended band. If you retune node
// values (PASSIVE_POWER_SCALE / PASSIVE_KEYSTONE_SCALE) and this fails, the tree got too strong or
// too weak for the adventure it sits on top of.

const SEEDS = 120
const BOSSES = ADVENTURE_AREAS.map(area => area.stages[area.stages.length - 1].enemy)
const byId = new Map(PASSIVE_NODES.map(node => [node.id, node]))

const ARCHETYPES: Record<string, Record<string, number>> = {
  attack: { atk: 1, crit: 1.2, critdmg: 0.5, dbl: 0.8, spd: 0.3, hp: 0.2, def: 0.2 },
  tank: { hp: 1, def: 1, shield: 0.6, regen: 2, thorns: 1, lifesteal: 1, atk: 0.2 },
  sustain: { lifesteal: 2, regen: 2, hp: 0.8, atk: 0.6, def: 0.5 },
  speed: { spd: 1, firstStrike: 30, dbl: 1, crit: 0.8, atk: 0.6 },
}

const score = (fx: IPassiveEffects, weights: Record<string, number>) =>
  Object.entries(fx).reduce((sum, [key, value]) => sum + (weights[key] ?? 0) * value, 0)

// Greedy: repeatedly take the connected path (up to 16 nodes) with the best average value.
const buildFor = (weights: Record<string, number>) => {
  const owned = new Set<string>()
  const picks: MasteryPicks = {}
  const valueOf = (node: IPassiveNode) => {
    if (!node.options) {
      return { fx: node.fx, pick: undefined }
    }
    const scored = node.options.map((option, index) => ({
      fx: option.fx,
      pick: index,
      value: score(option.fx, weights),
    }))
    return scored.reduce((best, entry) => (entry.value > best.value ? entry : best))
  }
  const usable = (node: IPassiveNode | undefined) =>
    !!node && node.kind !== 'ascend' && node.id !== PASSIVE_HUB && !owned.has(node.id)

  while (owned.size < PASSIVE_MAX_POINTS) {
    const remaining = PASSIVE_MAX_POINTS - owned.size
    const paths = new Map<string, string[]>()
    const queue: string[] = []
    for (const startId of [PASSIVE_HUB, ...owned]) {
      for (const next of byId.get(startId)!.adj) {
        if (usable(byId.get(next)) && !paths.has(next)) {
          paths.set(next, [next])
          queue.push(next)
        }
      }
    }
    let best: string[] = []
    let bestValue = -Infinity
    while (queue.length) {
      const id = queue.shift()!
      const path = paths.get(id)!
      if (path.length > Math.min(remaining, 16)) {
        continue
      }
      const value =
        path.reduce((sum, step) => sum + score(valueOf(byId.get(step)!).fx, weights), 0) /
        path.length
      if (value > bestValue || (value === bestValue && path.length > best.length)) {
        bestValue = value
        best = path
      }
      for (const next of byId.get(id)!.adj) {
        if (usable(byId.get(next)) && !paths.has(next)) {
          paths.set(next, [...path, next])
          queue.push(next)
        }
      }
    }
    if (!best.length) {
      break
    }
    for (const id of best.slice(0, remaining)) {
      owned.add(id)
      const { pick } = valueOf(byId.get(id)!)
      if (pick !== undefined) {
        picks[id] = pick
      }
    }
  }
  return calcPassiveBonus([...owned], picks)
}

const fighterWith = (stage: EnumMonsterStage, bonus: ReturnType<typeof calcPassiveBonus>) => {
  const base = STAGE_BASE_STATS[stage]
  const { pct, effects } = bonus.combat
  const fighter: IFighter = {
    name: 'p',
    emoji: 'p',
    element: EnumMonsterLine.FLAME,
    stats: {
      hp: Math.round(base.hp * (1 + pct.hp)),
      atk: Math.round(base.atk * (1 + pct.atk)),
      def: Math.round(base.def * (1 + pct.def)),
      spd: Math.round(base.spd * (1 + pct.spd)),
    },
    skill: { name: 's', power: 1.5 },
    ...(Object.keys(effects).length && { effects: capEffects(effects) }),
  }
  return fighter
}

const winRate = (
  stage: EnumMonsterStage,
  bonus: ReturnType<typeof calcPassiveBonus>,
  boss: number
) => {
  let wins = 0
  for (let seed = 1; seed <= SEEDS; seed++) {
    if (simulateBattle(fighterWith(stage, bonus), BOSSES[boss], seed).won) {
      wins++
    }
  }
  return wins / SEEDS
}

describe('passive tree balance', () => {
  const builds = Object.entries(ARCHETYPES).map(
    ([name, weights]) => [name, buildFor(weights)] as const
  )

  it.each(builds)(
    'a full %s build keeps the final boss out of reach of a perfect-form pet',
    (_name, bonus) => {
      expect(winRate(EnumMonsterStage.PERFECT, bonus, 4)).toBeLessThanOrEqual(0.25)
    }
  )

  it.each(builds)(
    'a full %s build lets an ultimate-form pet beat the early bosses',
    (_name, bonus) => {
      for (const boss of [0, 1, 3]) {
        expect(winRate(EnumMonsterStage.ULTIMATE, bonus, boss)).toBeGreaterThanOrEqual(0.9)
      }
    }
  )

  it.each(builds)('a full %s build gives a real boost over no passives', (_name, bonus) => {
    const none = calcPassiveBonus([])
    expect(winRate(EnumMonsterStage.PERFECT, bonus, 2)).toBeGreaterThan(
      winRate(EnumMonsterStage.PERFECT, none, 2)
    )
  })

  it('keeps every total stat penalty within the -90% clamp', () => {
    for (const [, bonus] of builds) {
      const { pct } = bonus.combat
      expect(Math.min(pct.hp, pct.atk, pct.def, pct.spd)).toBeGreaterThanOrEqual(-0.9)
    }
  })
})
