import { findPvpNpc, PVP_NPCS } from './pvp-data'
import { isEligibleOpponent, IPvpCandidate, pickOpponents } from './pvp-matchmaking'

const real = (id: string, rating: number): IPvpCandidate => ({ id, rating, isNpc: false })
const npc = (id: string, rating: number): IPvpCandidate => ({ id, rating, isNpc: true })
const none = new Map<string, number>()

describe('pickOpponents', () => {
  it('offers the nearest real players first, ties by id', () => {
    const picked = pickOpponents(
      [real('d', 1300), real('b', 1010), real('a', 1010), real('c', 950)],
      1000,
      none
    )
    expect(picked.map(candidate => candidate.id)).toEqual(['a', 'b', 'c'])
  })

  it('skips players outside the rating window and anyone fought twice today', () => {
    const picked = pickOpponents(
      [real('far', 1700), real('done', 1000), real('ok', 1100)],
      1000,
      new Map([['done', 2]])
    )
    expect(picked.map(candidate => candidate.id)).toEqual(['ok'])
  })

  it('fills with NPCs up to three, nearest first (ties by id), and never offers the same one twice', () => {
    const npcs = [npc('n900', 900), npc('n1000', 1000), npc('n1100', 1100)]
    const picked = pickOpponents([real('p', 1050), ...npcs], 1000, none)
    expect(picked.map(candidate => candidate.id)).toEqual(['p', 'n1000', 'n1100'])
    expect(new Set(picked.map(candidate => candidate.id)).size).toBe(picked.length)
  })

  it('still offers NPCs when every real player is used up', () => {
    const npcs = [npc('n900', 900), npc('n1000', 1000), npc('n1100', 1100)]
    expect(pickOpponents(npcs, 1000, new Map([['n1000', 99]]))).toHaveLength(3)
  })
})

describe('isEligibleOpponent', () => {
  it('applies the window and daily limit to real players only', () => {
    expect(isEligibleOpponent(real('a', 1600), 1000, none)).toBe(true)
    expect(isEligibleOpponent(real('a', 1601), 1000, none)).toBe(false)
    expect(isEligibleOpponent(real('a', 1000), 1000, new Map([['a', 2]]))).toBe(false)
    expect(isEligibleOpponent(npc('n', 100), 5000, new Map([['n', 50]]))).toBe(true)
  })
})

describe('NPC data', () => {
  it('has three rivals per form with unique ids, found by id', () => {
    expect(PVP_NPCS).toHaveLength(9)
    expect(new Set(PVP_NPCS.map(entry => entry.id)).size).toBe(9)
    expect(findPvpNpc(PVP_NPCS[4].id)).toBe(PVP_NPCS[4])
    expect(findPvpNpc('npc:nope:0')).toBeUndefined()
  })
})
