import { randomInt } from 'crypto'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EnhanceLogEntity } from '../../../db/entities/enhance-log.entity'
import { EquipmentItemEntity } from '../../../db/entities/equipment-item.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { EnhanceService } from './enhance.service'
import { EnumMaterialId } from './equipment-data'
import { itemRow, makeDataSource, makeEtm, USER } from './equipment-test-helpers'

jest.mock('crypto', () => ({
  ...jest.requireActual<typeof import('crypto')>('crypto'),
  randomInt: jest.fn(),
}))
const randomIntMock = randomInt as unknown as jest.Mock

// randomInt(0, 1_000_000) / 1_000_000 => rolls are given in millionths.
const rolls = (...values: number[]) =>
  values.forEach(value => randomIntMock.mockReturnValueOnce(value))

const setup = () => {
  const etm = makeEtm()
  const dataSource = makeDataSource(etm)
  const equipmentService = { getEquipment: jest.fn().mockResolvedValue({ screen: true }) }
  const inventoryService = {
    add: jest.fn(),
    spend: jest.fn().mockResolvedValue(true),
    getInventory: jest.fn().mockResolvedValue({ items: [{ itemId: 'x', quantity: 2 }] }),
  }
  const walletService = { change: jest.fn().mockResolvedValue({ coin: 3 }) }
  const service = new EnhanceService(
    dataSource as never,
    equipmentService as never,
    inventoryService as never,
    walletService as never
  )
  return { etm, equipmentService, inventoryService, walletService, service }
}

beforeEach(() => randomIntMock.mockReset().mockReturnValue(0))

describe('EnhanceService.getPreview', () => {
  it('rejects an unknown piece', async () => {
    const { service } = setup()
    await expect(service.getPreview(USER, 'item-1')).rejects.toThrow(
      new NotFoundException('Equipment not found')
    )
  })

  it('reports a maxed piece without a cost', async () => {
    const { service, etm } = setup()
    etm.findOne.mockResolvedValue(itemRow({ enhanceLevel: 15 }))
    const result = await service.getPreview(USER, 'item-1')
    expect(result).toMatchObject({ maxed: true, item: { id: 'item-1', enhanceLevel: 15 } })
    expect(result).not.toHaveProperty('rate')
  })

  it('shows the next step with the pity-adjusted rate', async () => {
    const { service, etm } = setup()
    etm.findOne.mockResolvedValue(itemRow({ enhanceLevel: 9, pity: 3 }))
    const result = await service.getPreview(USER, 'item-1')
    expect(result).toMatchObject({
      maxed: false,
      targetLevel: 10,
      baseRate: 0.4,
      rate: 0.46,
      onFail: 'drop',
      canProtect: true,
      cost: { coin: 1000, stones: 4 },
    })
  })
})

describe('EnhanceService.enhance', () => {
  const prepare = (item: unknown) => {
    const ctx = setup()
    ctx.etm.findOne.mockResolvedValue(item)
    return ctx
  }

  it('rejects a missing piece', async () => {
    const { service } = prepare(null)
    await expect(service.enhance(USER, 'item-1', false)).rejects.toThrow(
      new NotFoundException('Equipment not found')
    )
  })

  it('rejects a maxed piece', async () => {
    const { service } = prepare(itemRow({ enhanceLevel: 15 }))
    await expect(service.enhance(USER, 'item-1', false)).rejects.toThrow(
      new BadRequestException('Equipment is already at the maximum level')
    )
  })

  it('rejects a protect scroll where none is needed', async () => {
    const { service, walletService } = prepare(itemRow({ enhanceLevel: 2 }))
    await expect(service.enhance(USER, 'item-1', true)).rejects.toThrow(
      new BadRequestException('A protect scroll is not needed at this level')
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('rejects when there are not enough stones', async () => {
    const { service, inventoryService } = prepare(itemRow())
    inventoryService.spend.mockResolvedValueOnce(false)
    await expect(service.enhance(USER, 'item-1', false)).rejects.toThrow(
      new BadRequestException('Not enough enhance stones')
    )
  })

  it('rejects when the protect scroll is missing', async () => {
    const { service, inventoryService } = prepare(itemRow({ enhanceLevel: 9 }))
    inventoryService.spend.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(service.enhance(USER, 'item-1', true)).rejects.toThrow(
      new BadRequestException('You do not have a protect scroll')
    )
    expect(randomIntMock).not.toHaveBeenCalled()
  })

  it('charges coin and stones, then upgrades on success', async () => {
    const item = itemRow({ pity: 2 })
    const { service, etm, walletService, inventoryService, equipmentService } = prepare(item)
    const result = await service.enhance(USER, 'item-1', false)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -10,
      EnumWalletTransactionReason.ENHANCE,
      'item-1',
      expect.anything()
    )
    expect(inventoryService.spend).toHaveBeenCalledWith(
      USER,
      EnumMaterialId.ENHANCE_STONE,
      1,
      expect.anything()
    )
    expect(item).toMatchObject({ enhanceLevel: 1, pity: 0 })
    expect(etm.softDelete).not.toHaveBeenCalled()
    expect(etm.save).toHaveBeenCalledWith(
      EnhanceLogEntity,
      expect.objectContaining({
        fromLevel: 0,
        toLevel: 1,
        success: true,
        broke: false,
        pityBefore: 2,
        cost: { coin: 10, stones: 1, protectUsed: false },
      })
    )
    expect(equipmentService.getEquipment).toHaveBeenCalled()
    expect(result).toMatchObject({
      result: { success: true, broke: false, fromLevel: 0, toLevel: 1, protectUsed: false },
      wallet: { coin: 3 },
      equipment: { screen: true },
      inventory: [{ itemId: 'x', quantity: 2 }],
    })
  })

  it('gives the protect scroll back when the roll succeeds', async () => {
    rolls(0)
    const { service, inventoryService } = prepare(itemRow({ enhanceLevel: 9 }))
    const result = await service.enhance(USER, 'item-1', true)
    expect(result.result.protectUsed).toBe(false)
    expect(inventoryService.add).toHaveBeenCalledWith(
      USER,
      EnumMaterialId.PROTECT_SCROLL,
      expect.anything()
    )
  })

  it('consumes the protect scroll when a protected roll fails', async () => {
    rolls(999_999)
    const item = itemRow({ enhanceLevel: 9 })
    const { service, inventoryService } = prepare(item)
    const result = await service.enhance(USER, 'item-1', true)
    expect(result.result).toMatchObject({ success: false, protectUsed: true, toLevel: 9 })
    expect(item.pity).toBe(1)
    expect(inventoryService.add).not.toHaveBeenCalled()
  })

  it('drops a level on an unprotected failure', async () => {
    rolls(999_999)
    const item = itemRow({ enhanceLevel: 9 })
    const { service } = prepare(item)
    const result = await service.enhance(USER, 'item-1', false)
    expect(result.result).toMatchObject({ success: false, broke: false, toLevel: 8 })
  })

  it('breaks the piece at the top tiers: unequips it and soft-deletes it', async () => {
    rolls(999_999, 100_000)
    const item = itemRow({ enhanceLevel: 12, equipped: true, monsterId: 'pet-1' })
    const { service, etm } = prepare(item)
    const result = await service.enhance(USER, 'item-1', false)
    expect(result.result).toMatchObject({ broke: true, success: false, toLevel: 12 })
    expect(item).toMatchObject({ equipped: false, monsterId: null })
    expect(etm.softDelete).toHaveBeenCalledWith(EquipmentItemEntity, { id: 'item-1' })
    expect(etm.save).toHaveBeenCalledWith(
      EnhanceLogEntity,
      expect.objectContaining({ broke: true, toLevel: 12 })
    )
  })
})
