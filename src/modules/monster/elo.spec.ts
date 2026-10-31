import { calcElo, expectedScore, K_ATTACKER, K_DEFENDER, MIN_RATING } from './elo'

describe('elo', () => {
  it('expects 50% between equal ratings and favours the higher one', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5)
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.75)
    expect(expectedScore(1000, 1200)).toBeLessThan(0.25)
  })

  it('moves the challenger by K/2 on an even match', () => {
    expect(calcElo(1000, 1000, true).attacker).toBe(1000 + K_ATTACKER / 2)
    expect(calcElo(1000, 1000, false).attacker).toBe(1000 - K_ATTACKER / 2)
  })

  it('moves the defender less than the challenger, in the opposite direction', () => {
    const win = calcElo(1000, 1000, true)
    expect(win.defender).toBe(1000 - K_DEFENDER / 2)
    const loss = calcElo(1000, 1000, false)
    expect(loss.defender).toBe(1000 + K_DEFENDER / 2)
  })

  it('pays an upset more than an expected win', () => {
    const upset = calcElo(900, 1100, true).attacker - 900
    const expected = calcElo(1100, 900, true).attacker - 1100
    expect(upset).toBeGreaterThan(expected)
    expect(expected).toBeGreaterThan(0)
  })

  it('never goes below the floor', () => {
    // an even match at 10 would cost 16 (attacker) / 8 (defender): clamped to 0 instead
    expect(calcElo(10, 10, false).attacker).toBe(MIN_RATING)
    expect(calcElo(3, 3, true).defender).toBe(MIN_RATING)
  })
})
