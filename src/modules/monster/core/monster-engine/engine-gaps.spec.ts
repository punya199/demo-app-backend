import { EnumMonsterDeathCause } from '../../../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../../../db/entities/monster-log.entity'
import { applyAction, EnumMonsterAction, tick } from './index'
import { DEATH_AFTER_HUNGRY_MINUTES } from '../monster-rules'
import { minutesAfter, monster, NOW } from './test-fixtures'

describe('engine gaps', () => {
  it('vitamin adds a heart of strength and weight and clears the weak timer', () => {
    const { state } = applyAction(
      monster({ strength: 1, weakMinutes: 30, weight: 20 }),
      EnumMonsterAction.VITAMIN,
      NOW
    )
    expect(state.strength).toBe(2)
    expect(state.weakMinutes).toBe(0)
    expect(state.weight).toBeGreaterThan(20)
  })

  it('vitamin cannot push strength above the heart cap', () => {
    const { state } = applyAction(monster({ strength: 4 }), EnumMonsterAction.VITAMIN, NOW)
    expect(state.strength).toBe(4)
  })

  it('tick with no whole minute elapsed changes nothing', () => {
    const before = monster({ lastTickAt: NOW })
    const result = tick(before, new Date(NOW.getTime() + 30_000))
    expect(result.events).toEqual([])
    expect(result.state).toEqual(before)
  })

  it('starves a pet that stays unfed to the death threshold', () => {
    const { state, events } = tick(
      monster({ fullness: 0, hungryMinutes: DEATH_AFTER_HUNGRY_MINUTES - 1, lastTickAt: NOW }),
      minutesAfter(NOW, 1)
    )
    expect(state.diedAt).not.toBeNull()
    expect(state.deathCause).toBe(EnumMonsterDeathCause.STARVATION)
    expect(events.map(e => e.type)).toContain(EnumMonsterLogType.DEATH)
  })
})
