/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- jest mocks of untyped collaborators */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PvpBattleEntity } from '../../../db/entities/pvp-battle.entity'
import { PvpDefenseEntity } from '../../../db/entities/pvp-defense.entity'
import { PvpRatingEntity } from '../../../db/entities/pvp-rating.entity'
import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { toFighter } from '../battle/battle-stats'
import { MonsterRuleError } from '../core/monster-engine'
import { PVP_DAILY_ATTEMPTS, PVP_DEFENSE_COOLDOWN_MS } from '../core/monster-rules'
import { grantCostume } from '../equipment/costume.service'
import { loadEquipmentBonus } from '../equipment/equipment.service'
import { loadArenaLoadout } from '../passive/skill.service'
import { arenaBattleView, toArenaFighter } from './arena-fighter'
import { PVP_NPCS } from './pvp-data'
import { ensureRating, lockRatings, rankIn, initialRating } from './pvp-queries'
import {
  freezeClock,
  makeMonster,
  makeService,
  PVP_NOW,
  PVP_SEASON,
} from './pvp-service-test-helpers'

jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomInt: jest.fn(() => 4242) }))
jest.mock('./arena-fighter', () => {
  const actual = jest.requireActual('./arena-fighter')
  return { ...actual, arenaBattleView: jest.fn(actual.arenaBattleView) }
})
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
const LOADOUT = { s1: null, s2: null, dodge: 'dg_step' }

beforeEach(() => {
  jest.clearAllMocks()
  freezeClock()
  mocked(initialRating).mockResolvedValue(1000)
  mocked(rankIn).mockResolvedValue(1)
  mocked(loadEquipmentBonus).mockResolvedValue(undefined)
  mocked(loadArenaLoadout).mockResolvedValue(LOADOUT)
})
afterEach(() => jest.useRealTimers())

describe('PvpService.setDefense', () => {
  const run = async (displayName?: string, existing: unknown = null) => {
    const ctx = makeService()
    ctx.monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    // getStatus after the commit reads the same fake: no rating, no defense
    ctx.etm.findOne.mockImplementation(async (entity: unknown) =>
      entity === PvpDefenseEntity ? existing : null
    )
    return { ...ctx, result: ctx.service.setDefense('user-1', displayName) }
  }

  it.each([
    ['no monster', null],
    ['a dead monster', makeMonster({ diedAt: PVP_NOW })],
    ['a baby', makeMonster({ stage: EnumMonsterStage.BABY_1 })],
  ])('rejects %s', async (_label, monster) => {
    const { service, monsterService, etm } = makeService()
    monsterService.lockAndTickLatest.mockResolvedValue(monster)
    await expect(service.setDefense('user-1')).rejects.toThrow(
      new BadRequestException('Your monster is too young for the arena')
    )
    expect(etm.query).not.toHaveBeenCalled()
  })

  it('rejects a change inside the cooldown', async () => {
    const existing = { setAt: new Date(PVP_NOW.getTime() - PVP_DEFENSE_COOLDOWN_MS + 1000) }
    const { result, etm } = await run(undefined, existing)
    await expect(result).rejects.toThrow(
      new BadRequestException('Defense team was changed recently')
    )
    expect(etm.query).not.toHaveBeenCalled()
  })

  it('replaces an old defense once the cooldown has passed, keeping the profile name', async () => {
    const existing = { setAt: new Date(PVP_NOW.getTime() - PVP_DEFENSE_COOLDOWN_MS) }
    const { result, etm, profileService, monsterService } = await run('   ', existing)
    await result
    expect(profileService.setDisplayName).not.toHaveBeenCalled()
    expect(profileService.ensureProfile).toHaveBeenCalledWith('user-1', etm)
    expect(monsterService.lockAndTickLatest).toHaveBeenCalledWith('user-1', PVP_NOW, etm)
    const [sql, params] = etm.query.mock.calls.find(([text]) =>
      /INSERT INTO "pvp_defenses"/.test(text)
    )!
    expect(sql).toMatch(/ON CONFLICT/)
    const monster = makeMonster()
    expect(params[0]).toBe('user-1')
    expect(JSON.parse(params[1])).toEqual(toFighter(monster as never, undefined))
    expect(params[2]).toBe(monster.stage)
    expect(params[3]).toBe(monster.speciesId)
    expect(params[4]).toEqual(PVP_NOW)
    expect(JSON.parse(params[5])).toEqual(
      JSON.parse(JSON.stringify(toArenaFighter(monster as never, undefined, LOADOUT)))
    )
    expect(ensureRating).toHaveBeenCalledWith('user-1', PVP_SEASON, etm)
  })

  it('stores a chosen display name and returns the fresh status', async () => {
    const { result, etm, profileService } = await run('Arena Hero')
    const status = await result
    expect(profileService.setDisplayName).toHaveBeenCalledWith('user-1', 'Arena Hero', etm)
    expect(status.season).toBe(PVP_SEASON)
    expect(status.attemptsLeft).toBe(PVP_DAILY_ATTEMPTS)
  })
})

describe('PvpService.battle', () => {
  const NPC = PVP_NPCS.find(npc => (npc.stage as string) === 'adult')!
  const RIVAL_ID = '22222222-2222-4222-8222-222222222222'
  const rivalDefense = (overrides = {}) => ({
    id: RIVAL_ID,
    userId: 'user-2',
    stage: EnumMonsterStage.ADULT,
    fighter: toFighter(
      makeMonster({ speciesId: 'tide_adultGood', line: EnumMonsterLine.TIDE }) as never
    ),
    arenaFighter: null,
    ...overrides,
  })
  const attackerRow = (overrides = {}) => ({
    userId: 'user-1',
    rating: 1000,
    wins: 1,
    losses: 1,
    ...overrides,
  })

  // A service wired for a legal fight against `opponent` (defaults to a fresh NPC).
  const setup = (
    opts: { defense?: unknown; rows?: unknown[]; attempts?: number; mine?: unknown } = {}
  ) => {
    const ctx = makeService()
    const { etm, monsterService, profileService } = ctx
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    const myDefense = opts.mine === undefined ? { id: 'mine', userId: 'user-1' } : opts.mine
    etm.findOne.mockImplementation(
      async (_entity: unknown, query: { where: Record<string, string> }) =>
        query.where.id === RIVAL_ID ? (opts.defense ?? null) : query.where.userId ? myDefense : null
    )
    etm.count.mockImplementation(
      async (_entity: unknown, query: { where: { opponentId?: string } }) =>
        query.where.opponentId ? 0 : (opts.attempts ?? 0)
    )
    mocked(lockRatings).mockResolvedValue(opts.rows ?? [attackerRow()])
    profileService.getNames.mockResolvedValue(
      new Map([
        ['user-1', 'Me'],
        ['user-2', 'Rival'],
      ])
    )
    return ctx
  }
  const view = (won: boolean) => ({ won, rounds: 9, events: [] })

  it('needs a monster', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(null)
    await expect(service.battle('user-1', NPC.id)).rejects.toThrow(
      new NotFoundException('You do not have a monster yet')
    )
  })

  it('turns a rule error (sick monster) into a bad request', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster({ isSick: true }))
    const error = await service.battle('user-1', NPC.id).catch(e => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(error.message).toBe('Monster is sick')
    expect(error).not.toBeInstanceOf(MonsterRuleError)
  })

  it('keeps babies out of the arena', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(
      makeMonster({ stage: EnumMonsterStage.BABY_1 })
    )
    await expect(service.battle('user-1', NPC.id)).rejects.toThrow(
      new BadRequestException('Your monster is too young for the arena')
    )
  })

  it('needs a defense team first', async () => {
    const { service } = setup({ mine: null })
    await expect(service.battle('user-1', NPC.id)).rejects.toThrow(
      new BadRequestException('Set your defense team first')
    )
  })

  it('stops at the daily limit', async () => {
    const { service } = setup({ attempts: PVP_DAILY_ATTEMPTS })
    await expect(service.battle('user-1', NPC.id)).rejects.toThrow(
      new BadRequestException('Daily PvP limit reached')
    )
  })

  it.each([
    ['an unknown id', 'nope', undefined],
    ['an unknown uuid', RIVAL_ID, null],
    ['an opponent of another form', RIVAL_ID, rivalDefense({ stage: EnumMonsterStage.PERFECT })],
    ['your own defense', RIVAL_ID, rivalDefense({ userId: 'user-1' })],
    ['an NPC of another form', 'npc:perfect:0', undefined],
  ])('refuses %s', async (_label, opponentId, defense) => {
    const { service, walletService } = setup({ defense })
    await expect(service.battle('user-1', opponentId)).rejects.toThrow(
      new BadRequestException('Opponent is not available')
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('refuses a real opponent outside the rating window', async () => {
    const { service } = setup({
      defense: rivalDefense(),
      rows: [attackerRow(), { userId: 'user-2', rating: 3000, wins: 0, losses: 0 }],
    })
    await expect(service.battle('user-1', RIVAL_ID)).rejects.toThrow(
      new BadRequestException('Opponent is not available')
    )
  })

  it('beats an NPC: pays the win coin, moves only the attacker, logs the fight', async () => {
    const ctx = setup({ attempts: 2 })
    const { service, etm, monsterService, walletService } = ctx
    mocked(arenaBattleView).mockReturnValueOnce(view(true))

    const result = await service.battle('user-1', NPC.id)

    expect(ensureRating).toHaveBeenCalledTimes(1)
    expect(ensureRating).toHaveBeenCalledWith('user-1', PVP_SEASON, etm)
    expect(lockRatings).toHaveBeenCalledWith(['user-1'], PVP_SEASON, etm)
    expect(result.rating.before).toBe(1000)
    expect(result.rating.after).toBeGreaterThan(1000)
    expect(result.battle).toEqual({ ...view(true), reward: 15 })
    expect(result.attemptsLeft).toBe(PVP_DAILY_ATTEMPTS - 3)
    expect(result.wallet).toEqual({ coin: 100 })
    expect(walletService.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.COIN,
      15,
      EnumWalletTransactionReason.PVP_REWARD,
      NPC.id,
      etm
    )
    expect(monsterService.saveEvents).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'saved' }),
      [
        expect.objectContaining({
          payload: expect.objectContaining({
            won: true,
            mode: 'pvp',
            opponentId: NPC.id,
            seed: 4242,
          }),
        }),
      ],
      etm
    )
    const saves = etm.save.mock.calls
    expect(saves.filter(([entity]) => entity === PvpRatingEntity)).toHaveLength(1)
    const [, logged] = saves.find(([entity]) => entity === PvpBattleEntity)!
    expect(logged).toMatchObject({
      season: PVP_SEASON,
      attackerId: 'user-1',
      defenderId: null,
      opponentId: NPC.id,
      attackerName: 'Me',
      defenderName: NPC.fighter.name,
      seed: 4242,
      won: true,
      attackerRatingBefore: 1000,
      attackerRatingAfter: result.rating.after,
      defenderRatingBefore: NPC.rating,
      defenderRatingAfter: null,
      reward: 15,
    })
    expect(saves.find(([entity]) => entity === PvpRatingEntity)![1]).toMatchObject({
      wins: 2,
      losses: 1,
    })
  })

  it('loses to an NPC: pays the loss coin and the attempts floor at zero', async () => {
    const { service } = setup({ attempts: PVP_DAILY_ATTEMPTS - 1 })
    mocked(arenaBattleView).mockReturnValueOnce(view(false))
    const result = await service.battle('user-1', NPC.id)
    expect(result.rating.after).toBeLessThan(1000)
    expect(result.battle.reward).toBe(3)
    expect(result.attemptsLeft).toBe(0)
  })

  it('moves both ratings against a real defender, using the stored arena snapshot', async () => {
    const snapshot = toArenaFighter(
      makeMonster({ speciesId: 'tide_adultGood', line: EnumMonsterLine.TIDE }) as never,
      undefined,
      LOADOUT
    )
    const defenderRow = { userId: 'user-2', rating: 1100, wins: 3, losses: 3 }
    const { service, etm, profileService } = setup({
      defense: rivalDefense({ arenaFighter: snapshot }),
      rows: [attackerRow(), defenderRow],
    })
    mocked(arenaBattleView).mockReturnValueOnce(view(false))

    const result = await service.battle('user-1', RIVAL_ID)

    expect(ensureRating).toHaveBeenCalledWith('user-2', PVP_SEASON, etm)
    expect(lockRatings).toHaveBeenCalledWith(['user-1', 'user-2'], PVP_SEASON, etm)
    expect(profileService.getNames).toHaveBeenCalledWith(['user-1', 'user-2'], etm)
    expect(arenaBattleView).toHaveBeenCalledWith(expect.anything(), expect.anything(), snapshot)
    expect(defenderRow).toMatchObject({ wins: 4, losses: 3 })
    expect(defenderRow.rating).toBeGreaterThan(1100)
    expect(result.rating.after).toBeLessThan(1000)
    const [, logged] = etm.save.mock.calls.find(([entity]) => entity === PvpBattleEntity)!
    expect(logged).toMatchObject({
      defenderId: 'user-2',
      defenderName: 'Rival',
      won: false,
      defenderRatingBefore: 1100,
      defenderRatingAfter: defenderRow.rating,
    })
    expect(etm.save.mock.calls.filter(([entity]) => entity === PvpRatingEntity)).toHaveLength(2)
  })

  it('lets a real defender lose to the attacker', async () => {
    const defenderRow = { userId: 'user-2', rating: 1000, wins: 0, losses: 0 }
    const { service } = setup({ defense: rivalDefense(), rows: [attackerRow(), defenderRow] })
    mocked(arenaBattleView).mockReturnValueOnce(view(true))
    await service.battle('user-1', RIVAL_ID)
    expect(defenderRow).toMatchObject({ wins: 0, losses: 1 })
  })

  it('fights a full simulation when the view is not stubbed', async () => {
    const { service } = setup()
    const result = await service.battle('user-1', NPC.id)
    expect(typeof result.battle.won).toBe('boolean')
    expect(result.monster).toBeDefined()
  })
})

describe('PvpService.claimSeason payout', () => {
  const claim = async (
    rank: number,
    row = { id: 'row-1', rating: 1100, wins: 4, losses: 2, rewardClaimedAt: null }
  ) => {
    const ctx = makeService()
    ctx.etm.findOne.mockResolvedValue(row)
    mocked(rankIn).mockResolvedValue(rank)
    ctx.walletService.change
      .mockResolvedValueOnce({ step: 'coin' })
      .mockResolvedValueOnce({ step: 'gem' })
      .mockResolvedValueOnce({ step: 'raid' })
    return { ...ctx, result: await ctx.service.claimSeason('user-1', '2026-W02') }
  }

  it('pays coin, gem and raid tokens and gives the halo to the top three', async () => {
    const { result, etm, walletService } = await claim(2)
    expect(result).toEqual({
      season: '2026-W02',
      rank: 2,
      reward: { maxRank: 3, coin: 600, gem: 20, raidToken: 12 },
      wallet: { step: 'raid' },
      costumeId: 'rainbow',
    })
    expect(etm.builder.set).toHaveBeenCalledWith({ rewardClaimedAt: PVP_NOW })
    expect(etm.builder.where).toHaveBeenCalledWith('id = :id AND reward_claimed_at IS NULL', {
      id: 'row-1',
    })
    const R = EnumWalletTransactionReason.PVP_SEASON_REWARD
    expect(walletService.change.mock.calls).toEqual([
      ['user-1', EnumWalletCurrency.COIN, 600, R, '2026-W02', etm],
      ['user-1', EnumWalletCurrency.GEM, 20, R, '2026-W02', etm],
      ['user-1', EnumWalletCurrency.RAID_TOKEN, 12, R, '2026-W02', etm],
    ])
    expect(grantCostume).toHaveBeenCalledWith('user-1', 'rainbow', etm)
  })

  it('gives no halo below the top three', async () => {
    const { result } = await claim(4)
    expect(result.costumeId).toBeNull()
    expect(grantCostume).not.toHaveBeenCalled()
  })
})
