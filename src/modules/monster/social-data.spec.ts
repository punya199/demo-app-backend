import { createRng } from './battle-engine'
import {
  calcRentalFee,
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  generateFriendCode,
  isValidFriendCode,
  normalizeFriendCode,
  orderPair,
} from './social-data'

describe('friend codes', () => {
  it('generates codes from the unambiguous alphabet', () => {
    const rng = createRng(1)
    for (let index = 0; index < 200; index++) {
      const code = generateFriendCode(max => Math.floor(rng() * max))
      expect(code).toHaveLength(FRIEND_CODE_LENGTH)
      expect(isValidFriendCode(code)).toBe(true)
    }
    for (const confusing of ['0', 'O', '1', 'I', 'L']) {
      expect(FRIEND_CODE_ALPHABET).not.toContain(confusing)
    }
  })

  it('rarely repeats', () => {
    const rng = createRng(2)
    const codes = new Set(
      Array.from({ length: 5000 }, () => generateFriendCode(max => Math.floor(rng() * max)))
    )
    expect(codes.size).toBe(5000)
  })

  it('reads what a person typed', () => {
    expect(normalizeFriendCode(' abcd-2345 ')).toBe('ABCD2345')
    expect(isValidFriendCode(normalizeFriendCode('abcd-2345'))).toBe(true)
    expect(isValidFriendCode('ABCD234')).toBe(false)
    expect(isValidFriendCode('ABCD234O')).toBe(false)
  })
})

describe('friendship pairs', () => {
  const a = '0c8a1111-2222-4333-8444-555566667777'
  const b = 'f3b2aaaa-bbbb-4ccc-8ddd-eeeeffff0000'

  it('puts the smaller id first whichever way the pair is given', () => {
    expect(orderPair(a, b)).toEqual({ userLow: a, userHigh: b })
    expect(orderPair(b, a)).toEqual({ userLow: a, userHigh: b })
  })

  it('treats upper and lower case the same', () => {
    expect(orderPair(a.toUpperCase(), b)).toEqual(orderPair(a, b))
  })
})

describe('rental fee', () => {
  it('charges the full fee while the owner has room under the daily cap', () => {
    expect(calcRentalFee(0, 20, 200)).toBe(20)
    expect(calcRentalFee(180, 20, 200)).toBe(20)
  })

  it('charges only what still fits, then nothing at the cap', () => {
    expect(calcRentalFee(190, 20, 200)).toBe(10)
    expect(calcRentalFee(200, 20, 200)).toBe(0)
    expect(calcRentalFee(500, 20, 200)).toBe(0)
  })
})
