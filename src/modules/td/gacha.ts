import { BadRequestException, ConflictException } from '@nestjs/common'
import { createRng } from '../../libs/td-sim/rng'
import {
  GACHA_DUPLICATE_SHARDS,
  GACHA_PITY_LIMIT,
  GACHA_RARITIES,
  GACHA_RATES,
  GACHA_SINGLE_COST,
  GACHA_TEN_COST,
  ITdHeroDef,
  TD_HEROES,
  TdRarity,
} from './gacha.config'

export interface IGachaRoll {
  hero: ITdHeroDef
  /** Pulls since the last Legendary, after this pull. */
  pity: number
}

// Pure and seeded: the same (seed, pityBefore) always gives the same hero, so any logged pull can
// be re-verified. `pityBefore` is the number of pulls since the last Legendary.
export function rollHero(seed: number, pityBefore: number): IGachaRoll {
  const rng = createRng(seed)
  const point = rng.int(100)
  const forced = pityBefore + 1 >= GACHA_PITY_LIMIT
  let rarity: TdRarity = 'legendary'
  if (!forced) {
    let acc = 0
    for (const r of GACHA_RARITIES) {
      acc += GACHA_RATES[r]
      if (point < acc) {
        rarity = r
        break
      }
    }
  }
  const pool = TD_HEROES.filter(h => h.rarity === rarity)
  const hero = pool[rng.int(pool.length)]
  return { hero, pity: rarity === 'legendary' ? 0 : pityBefore + 1 }
}

export type GachaMode = 'single' | 'ten' | 'free'

export interface IPlannedPull {
  seed: number
  hero: ITdHeroDef
  pityBefore: number
  duplicate: boolean
  /** Shards granted for a duplicate, else 0. */
  shards: number
}

export interface IPullPlan {
  cost: number
  pulls: IPlannedPull[]
  /** Pity counter after the last pull. */
  pity: number
}

export const pullCount = (mode: GachaMode): number => (mode === 'ten' ? 10 : 1)

// Decides the outcome of a pull request from the player's current state. No I/O, so the money and
// pity rules are testable without a database; the service only loads state and persists the plan.
export function planPull(input: {
  mode: GachaMode
  gems: number
  pity: number
  freeClaimedToday: boolean
  owned: ReadonlySet<string>
  seeds: number[]
}): IPullPlan {
  const { mode } = input
  if (input.seeds.length !== pullCount(mode)) {
    throw new Error('One seed per pull is required')
  }
  if (mode === 'free' && input.freeClaimedToday) {
    throw new ConflictException('The free pull was already claimed today')
  }
  const cost = mode === 'free' ? 0 : mode === 'ten' ? GACHA_TEN_COST : GACHA_SINGLE_COST
  if (input.gems < cost) {
    throw new BadRequestException('Not enough gems')
  }
  const owned = new Set(input.owned)
  let pity = input.pity
  const pulls = input.seeds.map<IPlannedPull>(seed => {
    const pityBefore = pity
    const roll = rollHero(seed, pityBefore)
    pity = roll.pity
    const duplicate = owned.has(roll.hero.id)
    owned.add(roll.hero.id)
    return {
      seed,
      hero: roll.hero,
      pityBefore,
      duplicate,
      shards: duplicate ? GACHA_DUPLICATE_SHARDS[roll.hero.rarity] : 0,
    }
  })
  return { cost, pulls, pity }
}
