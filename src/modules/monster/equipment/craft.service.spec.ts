import { randomInt } from 'crypto'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { CraftJobEntity } from '../../../db/entities/craft-job.entity'
import { CraftPityEntity } from '../../../db/entities/craft-pity.entity'
import { EnumEquipmentLogType, EquipmentLogEntity } from '../../../db/entities/equipment-log.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { EQUIPMENT_CAPACITY } from '../core/monster-rules'
import { CraftController } from './craft.controller'
import { CraftService } from './craft.service'
import { CRAFT_PITY_AFTER_FAILS, CRAFT_RECIPES, recipeNeeds } from './craft-data'
import { CRAFT_CATALYST_ID } from './craft-materials'
import { makeDataSource, makeEtm, makeQb, NOW, USER } from './equipment-test-helpers'

jest.mock('crypto', () => ({
  ...jest.requireActual<typeof import('crypto')>('crypto'),
  randomInt: jest.fn(),
}))
const randomIntMock = randomInt as unknown as jest.Mock

const recipe = CRAFT_RECIPES[0]
const job = (overrides: Record<string, unknown> = {}) => ({
  id: 'job-1',
  userId: USER,
  recipeId: recipe.id,
  useCatalyst: false,
  startedAt: NOW,
  finishAt: NOW,
  claimedAt: null,
  ...overrides,
})

const setup = () => {
  const etm = makeEtm()
  const stock = (useCatalyst = false) => ({
    items: recipeNeeds(recipe, useCatalyst).map(need => ({
      itemId: need.itemId,
      quantity: need.qty,
    })),
  })
  const inventoryService = {
    getInventory: jest.fn().mockResolvedValue(stock()),
    spend: jest.fn().mockResolvedValue(true),
  }
  const walletService = {
    change: jest.fn(),
    getBalance: jest.fn().mockResolvedValue({ coin: 100_000 }),
  }
  const service = new CraftService(
    makeDataSource(etm) as never,
    inventoryService as never,
    walletService as never
  )
  return { etm, inventoryService, walletService, service, stock }
}

beforeAll(() => jest.useFakeTimers().setSystemTime(NOW))
afterAll(() => jest.useRealTimers())
beforeEach(() => randomIntMock.mockReset().mockReturnValue(0))

describe('CraftService.getOverview', () => {
  it('builds the screen from the job, bag, pity rows and coin balance', async () => {
    const { service, etm } = setup()
    etm.findOne.mockResolvedValue(job({ finishAt: new Date(NOW.getTime() + 60_000) }))
    etm.find.mockResolvedValue([{ step: 'epic_legendary', fails: 4 }])
    const overview = await service.getOverview(USER)
    expect(etm.findOne).toHaveBeenCalledWith(
      CraftJobEntity,
      expect.objectContaining({ where: expect.objectContaining({ userId: USER }) })
    )
    expect(overview.queue?.status).toBe('running')
    expect(overview.coin).toBe(100_000)
    expect(overview.catalyst.pity[0]).toMatchObject({ step: 'epic_legendary', fails: 4 })
  })
})

describe('CraftService.start', () => {
  it('rejects an unknown recipe', async () => {
    const { service } = setup()
    await expect(service.start(USER, 'nope', false)).rejects.toThrow(
      new NotFoundException('Recipe not found')
    )
  })

  it('rejects while a job is queued', async () => {
    const { service, etm, walletService } = setup()
    etm.findOne.mockResolvedValue(job())
    await expect(service.start(USER, recipe.id, false)).rejects.toThrow(
      new ConflictException('A craft is already in the queue')
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('rejects missing materials, including a missing catalyst', async () => {
    const { service, inventoryService } = setup()
    await expect(service.start(USER, recipe.id, true)).rejects.toThrow(
      new BadRequestException('Not enough materials')
    )
    inventoryService.getInventory.mockResolvedValue({ items: [] })
    await expect(service.start(USER, recipe.id, false)).rejects.toThrow(
      new BadRequestException('Not enough materials')
    )
  })

  it('rejects when the coins are short', async () => {
    const { service, walletService } = setup()
    walletService.getBalance.mockResolvedValue({ coin: recipe.coin - 1 })
    await expect(service.start(USER, recipe.id, false)).rejects.toThrow(
      new BadRequestException('Not enough coins')
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('rejects when a spend fails after the pre-check', async () => {
    const { service, inventoryService } = setup()
    inventoryService.spend.mockResolvedValue(false)
    await expect(service.start(USER, recipe.id, false)).rejects.toThrow(
      new BadRequestException('Not enough materials')
    )
  })

  it('charges coin and materials (catalyst too) and queues the job', async () => {
    const { service, etm, walletService, inventoryService, stock } = setup()
    inventoryService.getInventory.mockResolvedValue(stock(true))
    const overview = await service.start(USER, recipe.id, true)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -recipe.coin,
      EnumWalletTransactionReason.CRAFT,
      recipe.id,
      expect.anything()
    )
    expect(inventoryService.spend).toHaveBeenCalledTimes(recipeNeeds(recipe, true).length)
    expect(inventoryService.spend).toHaveBeenCalledWith(
      USER,
      CRAFT_CATALYST_ID,
      1,
      expect.anything()
    )
    expect(etm.save).toHaveBeenCalledWith(CraftJobEntity, {
      userId: USER,
      recipeId: recipe.id,
      useCatalyst: true,
      startedAt: NOW,
      finishAt: new Date(NOW.getTime() + recipe.minutes * 60_000),
      claimedAt: null,
    })
    expect(overview.recipes).toHaveLength(CRAFT_RECIPES.length)
  })

  it('turns a unique-index violation (a race) into a conflict', async () => {
    const { service, etm } = setup()
    etm.save.mockRejectedValue(new QueryFailedError('insert', [], { code: '23505' } as never))
    await expect(service.start(USER, recipe.id, false)).rejects.toThrow(
      new ConflictException('A craft is already in the queue')
    )
  })

  it.each([
    ['another database error', new QueryFailedError('insert', [], { code: '40001' } as never)],
    [
      'a database error without driver details',
      Object.assign(new QueryFailedError('insert', [], {} as never), { driverError: undefined }),
    ],
    ['a plain error', new Error('boom')],
  ])('rethrows %s', async (_label, error) => {
    const { service, etm } = setup()
    etm.save.mockRejectedValue(error)
    await expect(service.start(USER, recipe.id, false)).rejects.toBe(error)
  })
})

describe('CraftService.skip', () => {
  it('rejects without a job or with an unknown recipe', async () => {
    const { service, etm } = setup()
    await expect(service.skip(USER)).rejects.toThrow(
      new NotFoundException('There is no craft in the queue')
    )
    etm.findOne.mockResolvedValue(job({ recipeId: 'gone' }))
    await expect(service.skip(USER)).rejects.toThrow(
      new NotFoundException('There is no craft in the queue')
    )
  })

  it('charges the skip price and finishes the job now', async () => {
    const { service, etm, walletService } = setup()
    etm.findOne.mockResolvedValue(
      job({ finishAt: new Date(NOW.getTime() + recipe.minutes * 60_000) })
    )
    await service.skip(USER)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -recipe.coin * 2,
      EnumWalletTransactionReason.CRAFT_SKIP,
      'job-1',
      expect.anything()
    )
    expect(etm.update).toHaveBeenCalledWith(CraftJobEntity, { id: 'job-1' }, { finishAt: NOW })
  })

  it('does nothing for a job that is already finished', async () => {
    const { service, etm, walletService } = setup()
    etm.findOne.mockResolvedValue(job())
    await service.skip(USER)
    expect(walletService.change).not.toHaveBeenCalled()
    expect(etm.update).not.toHaveBeenCalled()
  })
})

describe('CraftService.claim', () => {
  const prepare = (jobRow: unknown = job(), updateResult: unknown = { affected: 1 }) => {
    const ctx = setup()
    ctx.etm.findOne.mockResolvedValue(jobRow)
    ctx.etm.createQueryBuilder.mockReturnValueOnce(makeQb(updateResult)).mockReturnValue(makeQb({}))
    return ctx
  }

  it('rejects without a job or with an unknown recipe', async () => {
    const none = prepare(null)
    await expect(none.service.claim(USER)).rejects.toThrow(
      new NotFoundException('There is no craft to claim')
    )
    const gone = prepare(job({ recipeId: 'gone' }))
    await expect(gone.service.claim(USER)).rejects.toThrow(
      new NotFoundException('There is no craft to claim')
    )
  })

  it('rejects an unfinished job', async () => {
    const { service } = prepare(job({ finishAt: new Date(NOW.getTime() + 1) }))
    await expect(service.claim(USER)).rejects.toThrow(
      new BadRequestException('The craft is not finished yet')
    )
  })

  it('keeps the job in the queue when the bag is full', async () => {
    const { service, etm } = prepare()
    etm.count.mockResolvedValue(EQUIPMENT_CAPACITY)
    await expect(service.claim(USER)).rejects.toThrow(
      new ConflictException('Equipment bag is full: free some space, then claim again')
    )
    expect(etm.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('refuses a double claim when the conditional update changed nothing', async () => {
    const { service } = prepare(job(), { affected: 0 })
    await expect(service.claim(USER)).rejects.toThrow(
      new ConflictException('This craft was already claimed')
    )
  })

  it('refuses when the bag fills up between the check and the grant', async () => {
    const { service, etm } = prepare()
    etm.count.mockResolvedValueOnce(0).mockResolvedValueOnce(EQUIPMENT_CAPACITY)
    await expect(service.claim(USER)).rejects.toThrow(
      new ConflictException('Equipment bag is full: free some space, then claim again')
    )
  })

  it('without a catalyst grants the base grade and leaves pity alone', async () => {
    const { service, etm } = prepare()
    const result = await service.claim(USER)
    expect(result.upgraded).toBe(false)
    expect(result.item.grade).toBe(recipe.baseGrade)
    expect(etm.update).not.toHaveBeenCalled()
    expect(etm.save).toHaveBeenCalledWith(EquipmentLogEntity, {
      userId: USER,
      equipmentId: 'row-new',
      type: EnumEquipmentLogType.CRAFT,
      payload: {
        recipeId: recipe.id,
        jobId: 'job-1',
        grade: recipe.baseGrade,
        upgraded: false,
        useCatalyst: false,
        failsBefore: 0,
      },
    })
    expect(result.overview.recipes).toHaveLength(CRAFT_RECIPES.length)
  })

  it('with a catalyst and a lucky roll upgrades and resets pity', async () => {
    const { service, etm } = prepare(job({ useCatalyst: true }))
    etm.findOneOrFail.mockResolvedValue({ fails: 2 })
    const result = await service.claim(USER)
    expect(result.upgraded).toBe(true)
    expect(result.item.grade).toBe(recipe.maxGrade)
    expect(etm.findOneOrFail).toHaveBeenCalledWith(
      CraftPityEntity,
      expect.objectContaining({ where: { userId: USER, step: recipe.step } })
    )
    expect(etm.update).toHaveBeenCalledWith(
      CraftPityEntity,
      { userId: USER, step: recipe.step },
      { fails: 0 }
    )
  })

  it('with a catalyst and an unlucky roll counts the failure', async () => {
    randomIntMock.mockReturnValue(999_999)
    const { service, etm } = prepare(job({ useCatalyst: true }))
    etm.findOneOrFail.mockResolvedValue({ fails: 2 })
    const result = await service.claim(USER)
    expect(result.upgraded).toBe(false)
    expect(etm.update).toHaveBeenCalledWith(
      CraftPityEntity,
      { userId: USER, step: recipe.step },
      { fails: 3 }
    )
  })

  it('guarantees the upgrade once the pity threshold is reached', async () => {
    randomIntMock.mockReturnValue(999_999)
    const { service, etm } = prepare(job({ useCatalyst: true }))
    etm.findOneOrFail.mockResolvedValue({ fails: CRAFT_PITY_AFTER_FAILS })
    expect((await service.claim(USER)).upgraded).toBe(true)
  })
})

describe('CraftController', () => {
  it('delegates each route with the caller id', async () => {
    const svc = {
      getOverview: jest.fn().mockResolvedValue('overview'),
      start: jest.fn().mockResolvedValue('start'),
      skip: jest.fn().mockResolvedValue('skip'),
      claim: jest.fn().mockResolvedValue('claim'),
    }
    const controller = new CraftController(svc as never)
    const user = { 'user-id': USER } as never
    expect(await controller.getOverview(user)).toBe('overview')
    expect(await controller.start({ recipeId: 'r', useCatalyst: true } as never, user)).toBe(
      'start'
    )
    expect(svc.start).toHaveBeenCalledWith(USER, 'r', true)
    expect(await controller.skip(user)).toBe('skip')
    expect(await controller.claim(user)).toBe('claim')
    expect(svc.claim).toHaveBeenCalledWith(USER)
  })
})
