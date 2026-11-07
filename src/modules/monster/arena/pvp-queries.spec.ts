/* eslint-disable @typescript-eslint/no-unsafe-member-access -- jest mocks of untyped collaborators */
import { EnumMonsterLine } from '../../../db/entities/monster.entity'
import { EntityManager } from 'typeorm'
import { PvpBattleEntity } from '../../../db/entities/pvp-battle.entity'
import { PvpDefenseEntity } from '../../../db/entities/pvp-defense.entity'
import { PvpRatingEntity } from '../../../db/entities/pvp-rating.entity'
import { IFighter } from '../battle/battle-stats'
import { defaultDisplayName } from '../core/display-name'
import { PVP_SEASON_RESET_KEEP } from '../core/monster-rules'
import { START_RATING } from './elo'
import { PVP_NPCS } from './pvp-data'
import {
  arenaDefenseOf,
  dayStart,
  ensureRating,
  fightsToday,
  initialRating,
  loadCandidates,
  lockRatings,
  rankIn,
  toHistoryEntry,
  toOpponentView,
} from './pvp-queries'

const fighter = (overrides: Partial<IFighter> = {}): IFighter => ({
  name: 'Fighter',
  emoji: '🔥',
  element: EnumMonsterLine.FLAME,
  stats: { hp: 100, atk: 10, def: 5, spd: 5 },
  skill: { name: 'Hit', power: 1 },
  ...overrides,
})

const fakeEtm = (queryResult: unknown = []) => {
  const builder: Record<string, jest.Mock> = {}
  for (const key of ['insert', 'into', 'values', 'orIgnore']) {
    builder[key] = jest.fn().mockReturnValue(builder)
  }
  builder.execute = jest.fn().mockResolvedValue(undefined)
  const etm = {
    query: jest.fn().mockResolvedValue(queryResult),
    find: jest.fn().mockResolvedValue(['rows']),
    createQueryBuilder: jest.fn().mockReturnValue(builder),
  }
  return { etm, builder, as: etm as unknown as EntityManager }
}

describe('pvp-queries', () => {
  it('dayStart is the start of the Thai quest day', () => {
    // 2026-01-01T03:00Z is 10:00 in Thailand; the day began at 00:00 +07 = 17:00Z the day before
    expect(dayStart(new Date('2026-01-01T03:00:00Z')).toISOString()).toBe(
      '2025-12-31T17:00:00.000Z'
    )
  })

  describe('arenaDefenseOf', () => {
    it('prefers the stored arena snapshot', () => {
      const snapshot = { name: 'snap' }
      const defense = { arenaFighter: snapshot, fighter: fighter() } as unknown as PvpDefenseEntity
      expect(arenaDefenseOf(defense)).toBe(snapshot)
    })

    it('falls back to the line defaults for a defense without a snapshot', () => {
      const defense = { arenaFighter: null, fighter: fighter() } as unknown as PvpDefenseEntity
      const spec = arenaDefenseOf(defense)
      expect(spec.name).toBe('Fighter')
      expect(spec.element).toBe(EnumMonsterLine.FLAME)
    })
  })

  describe('initialRating', () => {
    it('starts at the default rating with no earlier season', async () => {
      const { etm, as } = fakeEtm([])
      await expect(initialRating('u1', '2026-02', as)).resolves.toBe(START_RATING)
      expect(etm.query.mock.calls[0][1]).toEqual(['u1', '2026-02'])
    })

    it('soft-resets the latest earlier season rating', async () => {
      const { as } = fakeEtm([{ rating: START_RATING + 200 }])
      await expect(initialRating('u1', '2026-02', as)).resolves.toBe(
        Math.round(START_RATING + 200 * PVP_SEASON_RESET_KEEP)
      )
    })
  })

  it('ensureRating inserts a zeroed row and ignores conflicts', async () => {
    const { builder, as } = fakeEtm([])
    await ensureRating('u1', '2026-02', as)
    expect(builder.into).toHaveBeenCalledWith(PvpRatingEntity)
    expect(builder.values).toHaveBeenCalledWith({
      userId: 'u1',
      season: '2026-02',
      rating: START_RATING,
      wins: 0,
      losses: 0,
    })
    expect(builder.orIgnore).toHaveBeenCalled()
    expect(builder.execute).toHaveBeenCalled()
  })

  it('lockRatings locks in user-id order', async () => {
    const { etm, as } = fakeEtm()
    await expect(lockRatings(['b', 'a'], '2026-02', as)).resolves.toEqual(['rows'])
    const [entity, options] = etm.find.mock.calls[0]
    expect(entity).toBe(PvpRatingEntity)
    expect(options.order).toEqual({ userId: 'ASC' })
    expect(options.lock).toEqual({ mode: 'pessimistic_write' })
    expect(options.where.season).toBe('2026-02')
  })

  it('rankIn is one more than the players above', async () => {
    const { etm, as } = fakeEtm([{ better: 4 }])
    await expect(rankIn('2026-02', 1000, 3, as)).resolves.toBe(5)
    expect(etm.query.mock.calls[0][1]).toEqual(['2026-02', 1000, 3])
  })

  describe('loadCandidates', () => {
    const row = (overrides = {}) => ({
      id: 'd1',
      user_id: 'u2',
      display_name: 'Rival',
      fighter: fighter(),
      rating: 1010,
      ...overrides,
    })

    it('lists real defenders then the NPCs of the same stage', async () => {
      const { etm, as } = fakeEtm([row(), row({ id: 'd2', user_id: 'u3', display_name: null })])
      const result = await loadCandidates('u1', 'adult', '2026-02', as)
      expect(etm.query.mock.calls[0][1]).toEqual([
        'u1',
        'adult',
        '2026-02',
        START_RATING,
        PVP_SEASON_RESET_KEEP,
      ])
      expect(result.slice(0, 2)).toEqual([
        expect.objectContaining({ id: 'd1', userId: 'u2', displayName: 'Rival', isNpc: false }),
        expect.objectContaining({
          id: 'd2',
          userId: 'u3',
          displayName: defaultDisplayName('u3'),
          isNpc: false,
        }),
      ])
      const npcs = result.slice(2)
      const adultNpcs = PVP_NPCS.filter(npc => (npc.stage as string) === 'adult')
      expect(npcs.map(npc => npc.id)).toEqual(adultNpcs.map(npc => npc.id))
      expect(npcs.every(npc => npc.isNpc && npc.userId === null)).toBe(true)
      expect(npcs[0].displayName).toBe(adultNpcs[0].fighter.name)
      expect(npcs[0].rating).toBe(adultNpcs[0].rating)
    })

    it('is only the NPCs when nobody defends that stage', async () => {
      const { as } = fakeEtm([])
      const result = await loadCandidates('u1', 'perfect', '2026-02', as)
      expect(result).toHaveLength(3)
      expect(result.every(candidate => candidate.isNpc)).toBe(true)
    })
  })

  it('fightsToday maps opponents to their fight counts since the day start', async () => {
    const now = new Date('2026-01-01T03:00:00Z')
    const { etm, as } = fakeEtm([
      { opponent_id: 'o1', fights: 2 },
      { opponent_id: 'o2', fights: 1 },
    ])
    const map = await fightsToday('u1', now, as)
    expect(map.get('o1')).toBe(2)
    expect(map.get('o2')).toBe(1)
    expect(map.size).toBe(2)
    expect(etm.query.mock.calls[0][1]).toEqual(['u1', dayStart(now)])
  })

  describe('toOpponentView', () => {
    const candidate = {
      id: 'c1',
      userId: 'u9',
      displayName: 'Rival',
      rating: 1000,
      isNpc: false,
    }

    it('exposes the public fields only, with a null nickname by default', () => {
      const view = toOpponentView({ ...candidate, fighter: fighter() }, null)
      expect(view).toEqual({
        id: 'c1',
        displayName: 'Rival',
        emoji: '🔥',
        name: 'Fighter',
        nickname: null,
        costume: null,
        element: EnumMonsterLine.FLAME,
        stats: { hp: 100, atk: 10, def: 5, spd: 5 },
        rating: 1000,
        isNpc: false,
      })
      expect(JSON.stringify(view)).not.toContain('u9')
    })

    it('keeps a nickname and costume', () => {
      const costume = { hat: 'x' } as never
      const view = toOpponentView({ ...candidate, fighter: fighter({ nickname: 'Nick' }) }, costume)
      expect(view.nickname).toBe('Nick')
      expect(view.costume).toBe(costume)
    })
  })

  describe('toHistoryEntry', () => {
    const createdAt = new Date('2026-01-01T03:00:00Z')
    const row = {
      id: 'b1',
      season: '2026-01',
      attackerId: 'a',
      defenderId: 'd',
      attackerName: 'Atk',
      defenderName: 'Def',
      attacker: fighter({ emoji: 'A' }),
      defender: fighter({ emoji: 'D' }),
      won: true,
      attackerRatingBefore: 1000,
      attackerRatingAfter: 1016,
      defenderRatingBefore: 1000,
      defenderRatingAfter: 984,
      createdAt,
    } as unknown as PvpBattleEntity

    it('is the attacker point of view', () => {
      expect(toHistoryEntry(row, 'a')).toEqual({
        id: 'b1',
        season: '2026-01',
        role: 'attacker',
        won: true,
        opponentName: 'Def',
        opponentEmoji: 'D',
        ratingBefore: 1000,
        ratingAfter: 1016,
        createdAt,
      })
    })

    it('is the defender point of view, with the result flipped', () => {
      expect(toHistoryEntry(row, 'd')).toEqual({
        id: 'b1',
        season: '2026-01',
        role: 'defender',
        won: false,
        opponentName: 'Atk',
        opponentEmoji: 'A',
        ratingBefore: 1000,
        ratingAfter: 984,
        createdAt,
      })
    })
  })
})
