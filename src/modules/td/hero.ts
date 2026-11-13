import { BadRequestException, ConflictException } from '@nestjs/common'
import { HEROES, MAX_STAR, PoolEntry, STARTER_POOL } from '../../libs/td-sim'
import { STAR_UP_SHARD_COSTS } from './hero.config'

export interface IStarUpPlan {
  cost: number
  nextStar: number
}

// Pure. Decides a star-up from the hero's current star and the player's shard balance, so the
// money rules are testable without a database.
export function planStarUp(starLevel: number, shards: number): IStarUpPlan {
  if (starLevel >= MAX_STAR) {
    throw new ConflictException('The hero is already at the top star level')
  }
  const cost = STAR_UP_SHARD_COSTS[starLevel - 1]
  if (shards < cost) {
    throw new BadRequestException('Not enough shards')
  }
  return { cost, nextStar: starLevel + 1 }
}

// Pure. The battle's summon pool from the heroes a player owns; the caller stores the result with
// the battle session so the server replay uses this exact snapshot. A player with no (known)
// heroes gets the starter pool from td-sim config. Unknown ids are dropped and stars clamped so a
// bad row can never make the later replay fail validation.
export function buildPool(owned: { heroId: string; starLevel: number }[]): PoolEntry[] {
  const pool = owned
    .filter(h => Object.hasOwn(HEROES, h.heroId))
    .map(h => ({
      hero: h.heroId as PoolEntry['hero'],
      star: Math.min(MAX_STAR, Math.max(1, Math.trunc(h.starLevel) || 1)),
    }))
    .sort((a, b) => (a.hero < b.hero ? -1 : a.hero > b.hero ? 1 : 0))
  return pool.length ? pool : STARTER_POOL.map(p => ({ ...p }))
}
