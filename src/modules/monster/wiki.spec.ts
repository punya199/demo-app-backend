import { DEFENSE_K, MAX_DEF_CUT, VAR_MIN, VAR_SPAN } from './arena/arena-engine'
import { ARENA_MAX_TICKS, ARENA_TICK } from './arena/arena-rules'
import { buildWiki } from './wiki'

describe('buildWiki arena rules', () => {
  // The guide must describe the arena's own numbers, not the old turn engine's (the turn engine's
  // variance is +-15% and its elements x1.3 / x0.8).
  it('publishes the arena time limit, defense and damage spread', () => {
    const { arena } = buildWiki()
    expect(arena.timeLimitSec * ARENA_TICK).toBe(ARENA_MAX_TICKS)
    expect(arena.defenseK).toBe(DEFENSE_K)
    expect(arena.maxDefenseReduction).toBe(MAX_DEF_CUT / 10000)
    expect(arena.damageVarianceMin).toBe(VAR_MIN / 100)
    expect(Math.round((arena.damageVarianceMax - arena.damageVarianceMin) * 100)).toBe(VAR_SPAN - 1)
  })

  it('keeps the arena element multipliers apart from the old ones', () => {
    const { arena, battle } = buildWiki()
    expect(arena.strongMultiplier).toBe(1.1)
    expect(arena.weakMultiplier).toBe(0.9)
    expect(battle.strongMultiplier).not.toBe(arena.strongMultiplier)
  })
})
