import { ENERGY_CAP, ENERGY_REGEN_MS, regenerateEnergy } from './energy'

const T0 = new Date('2026-01-01T00:00:00Z')
const after = (minutes: number) => new Date(T0.getTime() + minutes * 60_000)

describe('regenerateEnergy', () => {
  it('uses the documented rules: cap 60, +1 every 6 minutes', () => {
    expect(ENERGY_CAP).toBe(60)
    expect(ENERGY_REGEN_MS).toBe(360_000)
  })

  it('gains nothing before a full 6 minutes have passed', () => {
    expect(regenerateEnergy(10, T0, after(5.9))).toEqual({ energy: 10, updatedAt: T0 })
  })

  it('gains 1 per full 6 minutes and keeps the partial remainder for the next read', () => {
    // 13 minutes = 2 full intervals + 1 minute left over; the clock moves only by 12 minutes.
    expect(regenerateEnergy(10, T0, after(13))).toEqual({ energy: 12, updatedAt: after(12) })
  })

  it('refills to the cap after a long offline gap and restarts the clock at now', () => {
    expect(regenerateEnergy(0, T0, after(60 * 24 * 30))).toEqual({
      energy: 60,
      updatedAt: after(60 * 24 * 30),
    })
  })

  it('stops exactly at the cap', () => {
    // 54 + 1 interval = 55; 54 + 2 intervals = 56 ... 54 + 6 intervals (36 min) = 60.
    expect(regenerateEnergy(54, T0, after(36)).energy).toBe(60)
    expect(regenerateEnergy(54, T0, after(35)).energy).toBe(59)
  })

  it('does not bank time while full: the clock restarts when energy is spent', () => {
    expect(regenerateEnergy(60, T0, after(600))).toEqual({ energy: 60, updatedAt: after(600) })
  })

  it('ignores a clock that moved backwards', () => {
    expect(regenerateEnergy(10, after(10), T0)).toEqual({ energy: 10, updatedAt: after(10) })
  })
})
