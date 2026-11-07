/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- jest mocks of untyped collaborators */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PvpDefenseEntity } from '../../../db/entities/pvp-defense.entity'
import { PvpRatingEntity } from '../../../db/entities/pvp-rating.entity'
import { PvpBattleEntity } from '../../../db/entities/pvp-battle.entity'
import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { defaultDisplayName } from '../core/display-name'
import { PVP_DAILY_ATTEMPTS, PVP_DEFENSE_COOLDOWN_MS } from '../core/monster-rules'
import { wellCaredArenaFighter } from './arena-test-helpers'
import { toFighter } from '../battle/battle-stats'
import { PVP_NPCS } from './pvp-data'
import { loadCandidates, fightsToday, initialRating, rankIn } from './pvp-queries'
import { loadPublicCostumes } from '../equipment/costume.service'
import {
  freezeClock,
  makeMonster,
  makeService,
  PVP_NOW,
  PVP_SEASON,
} from './pvp-service-test-helpers'

jest.mock('./pvp-queries', () => ({
  ...jest.requireActual('./pvp-queries'),
  initialRating: jest.fn(),
  ensureRating: jest.fn(),
  rankIn: jest.fn(),
  lockRatings: jest.fn(),
  loadCandidates: jest.fn(),
  fightsToday: jest.fn(),
}))
jest.mock('../equipment/costume.service', () => ({
  ...jest.requireActual('../equipment/costume.service'),
  loadPublicCostumes: jest.fn(),
  grantCostume: jest.fn(),
}))
jest.mock('../equipment/equipment.service', () => ({
  ...jest.requireActual('../equipment/equipment.service'),
  loadEquipmentBonus: jest.fn(),
}))
jest.mock('../passive/skill.service', () => ({
  ...jest.requireActual('../passive/skill.service'),
  loadArenaLoadout: jest.fn(),
}))

const mocked = <T>(fn: T) => fn as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  freezeClock()
  mocked(initialRating).mockResolvedValue(1000)
  mocked(rankIn).mockResolvedValue(7)
  mocked(fightsToday).mockResolvedValue(new Map())
  mocked(loadPublicCostumes).mockResolvedValue(new Map())
})
afterEach(() => jest.useRealTimers())

describe('PvpService.getStatus', () => {
  const stubReads = (
    etm: ReturnType<typeof makeService>['etm'],
    rating: unknown,
    defense: unknown,
    attempts: number
  ) => {
    etm.findOne.mockImplementation(async (entity: unknown) =>
      entity === PvpRatingEntity ? rating : entity === PvpDefenseEntity ? defense : null
    )
    etm.count.mockResolvedValue(attempts)
  }

  it('reports a fresh player: initial rating, no rank, no defense, all attempts', async () => {
    const { service, etm } = makeService()
    stubReads(etm, null, null, 0)
    const status = await service.getStatus('user-1')
    expect(status).toEqual({
      season: PVP_SEASON,
      resetsAt: new Date('2026-01-18T17:00:00Z'),
      rating: 1000,
      wins: 0,
      losses: 0,
      rank: null,
      attemptsLeft: PVP_DAILY_ATTEMPTS,
      defense: null,
      claimableSeasons: [],
    })
    expect(initialRating).toHaveBeenCalledWith('user-1', PVP_SEASON, etm)
    expect(rankIn).not.toHaveBeenCalled()
  })

  it('reports rank, defense, attempts used and claimable past seasons', async () => {
    const { service, etm, profileService } = makeService()
    const setAt = new Date(PVP_NOW.getTime() - 60_000)
    const fighter = { name: 'F' }
    stubReads(
      etm,
      { rating: 1234, wins: 3, losses: 2 },
      { fighter, stage: EnumMonsterStage.ADULT, setAt },
      PVP_DAILY_ATTEMPTS + 5
    )
    etm.query.mockResolvedValue([{ season: '2026-W02', rating: 1100, wins: 4, losses: 2 }])
    const status = await service.getStatus('user-1')
    expect(initialRating).not.toHaveBeenCalled()
    expect(status.rating).toBe(1234)
    expect(status.wins).toBe(3)
    expect(status.losses).toBe(2)
    expect(status.rank).toBe(7)
    expect(rankIn).toHaveBeenCalledWith(PVP_SEASON, 1234, 1, etm)
    expect(status.attemptsLeft).toBe(0)
    expect(status.defense).toEqual({
      displayName: 'Me',
      fighter,
      stage: EnumMonsterStage.ADULT,
      setAt,
      readyAt: new Date(setAt.getTime() + PVP_DEFENSE_COOLDOWN_MS),
    })
    expect(profileService.ensureProfile).toHaveBeenCalledWith('user-1', etm)
    expect(status.claimableSeasons).toEqual([
      {
        season: '2026-W02',
        rank: 7,
        rating: 1100,
        reward: { maxRank: 10, coin: 300, gem: 10, raidToken: 6 },
      },
    ])
  })

  it('gives no reward for a past season with too few fights', async () => {
    const { service, etm } = makeService()
    stubReads(etm, null, null, 3)
    etm.query.mockResolvedValue([{ season: '2026-W01', rating: 1000, wins: 1, losses: 1 }])
    const status = await service.getStatus('user-1')
    expect(status.attemptsLeft).toBe(PVP_DAILY_ATTEMPTS - 3)
    expect(status.claimableSeasons[0].reward).toBeNull()
  })
})

describe('PvpService.getOpponents', () => {
  it('offers nothing without a living monster', async () => {
    const { service, monsterService } = makeService()
    monsterService.getLatestAlive.mockResolvedValue(null)
    await expect(service.getOpponents('user-1')).resolves.toEqual({ opponents: [] })
  })

  it('offers nothing to a monster too young for the arena', async () => {
    const { service, monsterService } = makeService()
    monsterService.getLatestAlive.mockResolvedValue(makeMonster({ stage: EnumMonsterStage.BABY_1 }))
    await expect(service.getOpponents('user-1')).resolves.toEqual({ opponents: [] })
    expect(loadCandidates).not.toHaveBeenCalled()
  })

  it('picks opponents with the stored rating and attaches public costumes', async () => {
    const { service, monsterService, etm } = makeService()
    monsterService.getLatestAlive.mockResolvedValue(makeMonster())
    etm.findOne.mockResolvedValue({ rating: 1010 })
    const fighter = toFighter(makeMonster() as never)
    const real = {
      id: 'd1',
      userId: 'user-2',
      displayName: 'Rival',
      fighter,
      rating: 1020,
      isNpc: false,
    }
    const npc = PVP_NPCS.find(entry => (entry.stage as string) === 'adult')!
    const npcCandidate = {
      id: npc.id,
      userId: null,
      displayName: npc.fighter.name,
      fighter: npc.fighter,
      rating: npc.rating,
      isNpc: true,
    }
    const bare = { ...real, id: 'd2', userId: 'user-3', rating: 1030 }
    mocked(loadCandidates).mockResolvedValue([real, bare, npcCandidate])
    const costume = { hat: 'crown' }
    mocked(loadPublicCostumes).mockResolvedValue(new Map([['user-2', costume]]))

    const { opponents } = await service.getOpponents('user-1')

    expect(initialRating).not.toHaveBeenCalled()
    expect(loadCandidates).toHaveBeenCalledWith('user-1', 'adult', PVP_SEASON, etm)
    expect(loadPublicCostumes).toHaveBeenCalledWith(['user-2', 'user-3'], etm)
    expect(opponents.map(entry => entry.id)).toEqual(['d1', 'd2', npc.id])
    expect(opponents[0].costume).toBe(costume)
    expect(opponents[1].costume).toBeNull()
    expect(opponents[2].costume).toBeNull()
    expect(JSON.stringify(opponents)).not.toContain('user-2')
  })

  it('falls back to the initial rating without a rating row', async () => {
    const { service, monsterService } = makeService()
    monsterService.getLatestAlive.mockResolvedValue(makeMonster())
    mocked(loadCandidates).mockResolvedValue([])
    await expect(service.getOpponents('user-1')).resolves.toEqual({ opponents: [] })
    expect(initialRating).toHaveBeenCalled()
  })
})

describe('PvpService.getHistory', () => {
  it('maps the latest fights to the caller point of view', async () => {
    const { service, etm } = makeService()
    const fighter = toFighter(makeMonster() as never)
    etm.find.mockResolvedValue([
      {
        id: 'b1',
        season: PVP_SEASON,
        attackerId: 'user-1',
        defenderId: 'user-2',
        attackerName: 'Me',
        defenderName: 'Rival',
        attacker: fighter,
        defender: fighter,
        won: true,
        attackerRatingBefore: 1000,
        attackerRatingAfter: 1016,
        defenderRatingBefore: 1000,
        defenderRatingAfter: 984,
        createdAt: PVP_NOW,
      },
    ])
    const { battles } = await service.getHistory('user-1')
    expect(etm.find).toHaveBeenCalledWith(PvpBattleEntity, {
      where: [{ attackerId: 'user-1' }, { defenderId: 'user-1' }],
      order: { createdAt: 'DESC' },
      take: 20,
    })
    expect(battles).toEqual([
      expect.objectContaining({ id: 'b1', role: 'attacker', won: true, opponentName: 'Rival' }),
    ])
  })
})

describe('PvpService.getLeaderboard', () => {
  const row = (overrides = {}) => ({
    rank: 1,
    rating: 1100,
    wins: 5,
    losses: 1,
    user_id: 'user-9',
    display_name: 'Champ',
    emoji: '🔥',
    name: 'Blaze',
    nickname: null,
    is_me: true,
    ...overrides,
  })

  it('shows a requested season with costumes, profile names and the caller flag', async () => {
    const { service, dataSource } = makeService()
    dataSource.query.mockResolvedValue([
      row(),
      row({ user_id: 'user-8', display_name: null, rank: 2, is_me: false }),
    ])
    mocked(loadPublicCostumes).mockResolvedValue(new Map([['user-9', { hat: 'crown' }]]))
    const result = await service.getLeaderboard('user-1', '2025-W50')
    expect(dataSource.query.mock.calls[0][1]).toEqual(['2025-W50', 'user-1'])
    expect(result.season).toBe('2025-W50')
    expect(result.entries[0]).toEqual({
      costume: { hat: 'crown' },
      rank: 1,
      displayName: 'Champ',
      emoji: '🔥',
      name: 'Blaze',
      nickname: null,
      rating: 1100,
      wins: 5,
      losses: 1,
      isMe: true,
    })
    expect(result.entries[1].costume).toBeNull()
    expect(result.entries[1].displayName).toBe(defaultDisplayName('user-8'))
    expect(result.entries[1].isMe).toBe(false)
    expect(JSON.stringify(result)).not.toContain('user-8')
  })

  it('defaults to the current season', async () => {
    const { service, dataSource } = makeService()
    const result = await service.getLeaderboard('user-1')
    expect(result).toEqual({ season: PVP_SEASON, entries: [] })
    expect(dataSource.query.mock.calls[0][1]).toEqual([PVP_SEASON, 'user-1'])
  })
})

describe('PvpService.getReplay', () => {
  const arenaRow = () => {
    const attacker = wellCaredArenaFighter(EnumMonsterLine.FLAME, EnumMonsterStage.ADULT)
    const defender = wellCaredArenaFighter(EnumMonsterLine.TIDE, EnumMonsterStage.ADULT)
    return { attacker, defender }
  }
  const ID = '11111111-1111-4111-8111-111111111111'

  it('rejects ids that are not UUIDs without querying', async () => {
    const { service, etm } = makeService()
    await expect(service.getReplay('user-1', 'nope')).rejects.toThrow(
      new NotFoundException('Battle not found')
    )
    expect(etm.findOne).not.toHaveBeenCalled()
  })

  it('rejects a fight the caller took no part in', async () => {
    const { service, etm } = makeService()
    etm.findOne.mockResolvedValue(null)
    await expect(service.getReplay('user-1', ID)).rejects.toThrow(NotFoundException)
    expect(etm.findOne).toHaveBeenCalledWith(PvpBattleEntity, {
      where: [
        { id: ID, attackerId: 'user-1' },
        { id: ID, defenderId: 'user-1' },
      ],
    })
  })

  it('replays an arena fight from its seed, as attacker', async () => {
    const { service, etm } = makeService()
    const { attacker, defender } = arenaRow()
    etm.findOne.mockResolvedValue({
      attackerId: 'user-1',
      defenderId: 'user-2',
      arenaAttacker: attacker,
      arenaDefender: defender,
      won: true,
      seed: 42,
    })
    const first = await service.getReplay('user-1', ID)
    const second = await service.getReplay('user-1', ID)
    expect(first.role).toBe('attacker')
    expect(first.attackerWon).toBe(true)
    expect(first).toHaveProperty('rounds')
    expect(second).toEqual(first)
  })

  it('replays an arena fight as defender', async () => {
    const { service, etm } = makeService()
    const { attacker, defender } = arenaRow()
    etm.findOne.mockResolvedValue({
      attackerId: 'user-2',
      defenderId: 'user-1',
      arenaAttacker: attacker,
      arenaDefender: defender,
      won: false,
      seed: 42,
    })
    const replay = await service.getReplay('user-1', ID)
    expect(replay.role).toBe('defender')
    expect(replay.attackerWon).toBe(false)
  })

  it('replays an old fight on the turn engine', async () => {
    const { service, etm } = makeService()
    const attacker = toFighter(makeMonster() as never)
    const defender = toFighter(
      makeMonster({ speciesId: 'tide_adultGood', line: EnumMonsterLine.TIDE }) as never
    )
    etm.findOne.mockResolvedValue({
      attackerId: 'user-1',
      defenderId: null,
      arenaAttacker: null,
      arenaDefender: null,
      attacker,
      defender,
      won: true,
      seed: 7,
    })
    const replay = await service.getReplay('user-1', ID)
    expect(replay.role).toBe('attacker')
    expect(replay).toEqual(
      expect.objectContaining({
        attacker,
        defender,
        rounds: expect.any(Number),
        events: expect.any(Array),
      })
    )
    expect(typeof replay.attackerWon).toBe('boolean')
  })
})

describe('PvpService.claimSeason', () => {
  const rated = (overrides = {}) => ({
    id: 'row-1',
    rating: 1100,
    wins: 4,
    losses: 2,
    rewardClaimedAt: null,
    ...overrides,
  })

  it('refuses a season that has not ended', async () => {
    const { service, dataSource } = makeService()
    await expect(service.claimSeason('user-1', PVP_SEASON)).rejects.toThrow(
      new BadRequestException('Season has not ended yet')
    )
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  it.each([
    ['no row', null],
    ['an already claimed row', rated({ rewardClaimedAt: PVP_NOW })],
  ])('refuses %s', async (_label, row) => {
    const { service, etm } = makeService()
    etm.findOne.mockResolvedValue(row)
    await expect(service.claimSeason('user-1', '2026-W02')).rejects.toThrow(
      new BadRequestException('No season reward to claim')
    )
  })

  it('refuses a player with too few fights', async () => {
    const { service, etm } = makeService()
    etm.findOne.mockResolvedValue(rated({ wins: 1, losses: 1 }))
    await expect(service.claimSeason('user-1', '2026-W02')).rejects.toThrow(
      new BadRequestException('Not enough fights to earn a season reward')
    )
  })

  it('loses a race for the claim', async () => {
    const { service, etm, walletService } = makeService()
    etm.findOne.mockResolvedValue(rated())
    etm.builder.execute.mockResolvedValue({ affected: 0 })
    await expect(service.claimSeason('user-1', '2026-W02')).rejects.toThrow(
      new BadRequestException('No season reward to claim')
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })
})
