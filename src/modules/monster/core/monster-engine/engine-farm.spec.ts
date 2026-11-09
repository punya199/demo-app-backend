import { EnumMonsterStage } from '../../../../db/entities/monster.entity'
import { DEATH_AFTER_HUNGRY_MINUTES, STAGE_RATES } from '../monster-rules'
import { emptyFarmTiers, farmEffects } from '../../farm/farm-data'
import { tick } from './index'
import { minutesAfter, monster, NOW } from './test-fixtures'

const bed3 = farmEffects({ ...emptyFarmTiers(), bed: 3 })
const gym3 = farmEffects({ ...emptyFarmTiers(), gym: 3 })
const table3 = farmEffects({ ...emptyFarmTiers(), table: 3 })
const rates = STAGE_RATES[EnumMonsterStage.ADULT]

describe('tick with Farm furniture', () => {
  it('drains strength slower with a gym', () => {
    const after = rates.strengthMinutes * 2
    const plain = tick(monster({ strength: 4 }), minutesAfter(NOW, after)).state.strength
    const gym = tick(monster({ strength: 4 }), minutesAfter(NOW, after), 1, 1, gym3).state.strength
    expect(plain).toBeCloseTo(2)
    expect(gym).toBeCloseTo(4 - 2 / 1.5)
  })

  it('applies the table through the existing fullness drain', () => {
    const after = rates.fullnessMinutes * 2
    const state = monster({ fullness: 4, strength: 4 })
    const withTable = tick(state, minutesAfter(NOW, after), table3.fullnessDrain, 1, table3).state
    expect(withTable.fullness).toBeCloseTo(4 - 2 / 1.5)
  })

  it('makes a hungry monster sick later with a bed, not at the plain time', () => {
    const base = monster({ fullness: 0, strength: 4, hungryMinutes: 0 })
    const plainTime = 6 * 60
    const plain = tick(base, minutesAfter(NOW, plainTime)).state
    expect(plain.isSick).toBe(true)
    const bed = tick(base, minutesAfter(NOW, plainTime), 1, 1, bed3).state
    expect(bed.isSick).toBe(false)
    expect(tick(base, minutesAfter(NOW, plainTime * 2), 1, 1, bed3).state.isSick).toBe(true)
  })

  it('does not become sick again every minute after medicine while still hungry', () => {
    const cured = monster({ fullness: 0, strength: 4, hungryMinutes: 6 * 60 + 5, isSick: false })
    const { events } = tick(cured, minutesAfter(NOW, 10), 1, 1, bed3)
    expect(events).toEqual([])
  })

  it('never delays starvation: the death timer ignores the furniture', () => {
    const base = monster({
      fullness: 0,
      strength: 4,
      hungryMinutes: DEATH_AFTER_HUNGRY_MINUTES - 1,
    })
    const { state } = tick(base, minutesAfter(NOW, 1), 1, 1, bed3)
    expect(state.diedAt).not.toBeNull()
  })
})
