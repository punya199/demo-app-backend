import { DEFENSE_K, MAX_DEF_CUT, VAR_MIN, VAR_SPAN } from '../arena/arena-engine'
import { SKILLED_STAGES } from '../arena/arena-fighter'
import { ARENA_MAX_TICKS, ARENA_TICK, SKILL_DELAY_TICKS } from '../arena/arena-rules'
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

  it('publishes who fights with skills and the shared skill delay', () => {
    const { arena } = buildWiki()
    expect(arena.skilledStages).toEqual(SKILLED_STAGES)
    expect(arena.skillTierPct).toEqual({
      baby2: 75,
      adult: 100,
      perfect: 120,
      ultimate: 140,
      fused: 160,
    })
    expect(arena.skillDelaySec * ARENA_TICK).toBe(SKILL_DELAY_TICKS)
  })

  it('keeps the arena element multipliers apart from the old ones', () => {
    const { arena, battle } = buildWiki()
    expect(arena.strongMultiplier).toBe(1.1)
    expect(arena.weakMultiplier).toBe(0.9)
    expect(battle.strongMultiplier).not.toBe(arena.strongMultiplier)
  })
})
