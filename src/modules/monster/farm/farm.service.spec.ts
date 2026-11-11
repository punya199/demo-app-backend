import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { CraftJobEntity, EnumCraftJobKind } from '../../../db/entities/craft-job.entity'
import { PlayerFurnitureEntity } from '../../../db/entities/player-furniture.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { makeDataSource, makeEtm, makeQb, NOW, USER } from '../equipment/equipment-test-helpers'
import { EnumFurnitureKind, FURNITURE_BUY_COIN, findFurnitureRecipe } from './farm-data'
import { FarmService } from './farm.service'

const bed2 = findFurnitureRecipe('farm_bed:2')!

const setup = (tier: Record<string, number> = {}) => {
  const etm = makeEtm()
  etm.find.mockImplementation((entity: unknown) =>
    Promise.resolve(
      entity === PlayerFurnitureEntity
        ? Object.entries(tier).map(([kind, value]) => ({ kind, tier: value }))
        : []
    )
  )
  etm.findOne.mockResolvedValue(null)
  const monsterService = { lockAndTickLiving: jest.fn().mockResolvedValue([]) }
  const inventoryService = {
    getInventory: jest.fn().mockResolvedValue({
      items: bed2.materials.map(need => ({ itemId: need.itemId, quantity: need.qty })),
    }),
    spend: jest.fn().mockResolvedValue(true),
  }
  const walletService = {
    change: jest.fn(),
    getBalance: jest.fn().mockResolvedValue({ coin: 100_000 }),
  }
  const service = new FarmService(
    makeDataSource(etm) as never,
    monsterService as never,
    inventoryService as never,
    walletService as never
  )
  return { etm, monsterService, inventoryService, walletService, service }
}

beforeAll(() => jest.useFakeTimers().setSystemTime(NOW))
afterAll(() => jest.useRealTimers())

describe('FarmService.buy', () => {
  it('catches the monsters up first, then charges and stores tier 1', async () => {
    const { service, etm, monsterService, walletService } = setup()
    await service.buy(USER, EnumFurnitureKind.BED)
    expect(monsterService.lockAndTickLiving).toHaveBeenCalledWith(USER, NOW, etm)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -FURNITURE_BUY_COIN,
      EnumWalletTransactionReason.FARM_FURNITURE,
      'bed:1',
      etm
    )
    expect(etm.save).toHaveBeenCalledWith(PlayerFurnitureEntity, {
      userId: USER,
      kind: 'bed',
      tier: 1,
    })
    const tickOrder = monsterService.lockAndTickLiving.mock.invocationCallOrder[0]
    expect(tickOrder).toBeLessThan(walletService.change.mock.invocationCallOrder[0])
  })

  it('refuses a piece that is already owned, without charging', async () => {
    const { service, walletService } = setup({ bed: 1 })
    await expect(service.buy(USER, EnumFurnitureKind.BED)).rejects.toBeInstanceOf(
      BadRequestException
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })
})

describe('FarmService.startUpgrade', () => {
  it('needs tier 1 first', async () => {
    const { service, walletService } = setup()
    await expect(service.startUpgrade(USER, EnumFurnitureKind.BED)).rejects.toBeInstanceOf(
      BadRequestException
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('spends coin and materials and queues a job that ends after the recipe time', async () => {
    const { service, etm, inventoryService, walletService } = setup({ bed: 1 })
    await service.startUpgrade(USER, EnumFurnitureKind.BED)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -bed2.coin,
      EnumWalletTransactionReason.FARM_FURNITURE,
      bed2.id,
      etm
    )
    expect(inventoryService.spend).toHaveBeenCalledTimes(bed2.materials.length)
    expect(etm.save).toHaveBeenCalledWith(
      CraftJobEntity,
      expect.objectContaining({
        kind: EnumCraftJobKind.FURNITURE,
        recipeId: bed2.id,
        useCatalyst: false,
        finishAt: new Date(NOW.getTime() + bed2.minutes * 60_000),
      })
    )
  })

  it('only looks at the furniture queue, so an equipment craft never blocks it', async () => {
    const { service, etm } = setup({ bed: 1 })
    await service.startUpgrade(USER, EnumFurnitureKind.BED)
    expect(etm.findOne).toHaveBeenCalledWith(
      CraftJobEntity,
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER, kind: EnumCraftJobKind.FURNITURE }),
      })
    )
    expect(etm.save).toHaveBeenCalled()
  })

  it('refuses a second furniture craft while one is queued', async () => {
    const { service, etm, walletService } = setup({ bed: 1 })
    etm.findOne.mockResolvedValue({ recipeId: bed2.id, finishAt: NOW, startedAt: NOW })
    await expect(service.startUpgrade(USER, EnumFurnitureKind.BED)).rejects.toBeInstanceOf(
      ConflictException
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('refuses when materials are short, before taking any coin', async () => {
    const { service, inventoryService, walletService } = setup({ bed: 1 })
    inventoryService.getInventory.mockResolvedValue({ items: [] })
    await expect(service.startUpgrade(USER, EnumFurnitureKind.BED)).rejects.toThrow(/materials/)
    expect(walletService.change).not.toHaveBeenCalled()
  })
})

describe('FarmService.claim', () => {
  const finished = { id: 'job-1', recipeId: bed2.id, finishAt: NOW, startedAt: NOW }

  it('rejects when there is no furniture craft (an equipment job is not one)', async () => {
    const { service, etm } = setup({ bed: 1 })
    await expect(service.claim(USER)).rejects.toBeInstanceOf(NotFoundException)
    etm.findOne.mockResolvedValue({ ...finished, recipeId: 'bulwark:weapon' })
    await expect(service.claim(USER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('waits for the timer: there is no skip', async () => {
    const { service, etm } = setup({ bed: 1 })
    etm.findOne.mockResolvedValue({ ...finished, finishAt: new Date(NOW.getTime() + 1000) })
    await expect(service.claim(USER)).rejects.toThrow(/not finished/)
  })

  it('raises the tier after catching the monsters up under the old tier', async () => {
    const { service, etm, monsterService } = setup({ bed: 1 })
    etm.findOne.mockResolvedValue(finished)
    etm.createQueryBuilder.mockReturnValue(makeQb({ affected: 1 }))
    await service.claim(USER)
    expect(monsterService.lockAndTickLiving).toHaveBeenCalledWith(USER, NOW, etm)
    expect(etm.update).toHaveBeenCalledWith(
      PlayerFurnitureEntity,
      { userId: USER, kind: 'bed' },
      { tier: 2 }
    )
  })

  it('refuses a craft whose tier no longer fits, and a double claim', async () => {
    const stale = setup({ bed: 2 })
    stale.etm.findOne.mockResolvedValue(finished)
    await expect(stale.service.claim(USER)).rejects.toBeInstanceOf(ConflictException)
    const double = setup({ bed: 1 })
    double.etm.findOne.mockResolvedValue(finished)
    double.etm.createQueryBuilder.mockReturnValue(makeQb({ affected: 0 }))
    await expect(double.service.claim(USER)).rejects.toThrow(/already claimed/)
    expect(double.etm.update).not.toHaveBeenCalled()
  })
})
