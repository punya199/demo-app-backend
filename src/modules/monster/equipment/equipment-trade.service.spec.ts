import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EnumEquipmentLogType, EquipmentLogEntity } from '../../../db/entities/equipment-log.entity'
import { EquipmentItemEntity } from '../../../db/entities/equipment-item.entity'
import { MonsterEntity } from '../../../db/entities/monster.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { EQUIPMENT_BOX_PRICE, EQUIPMENT_CAPACITY } from '../core/monster-rules'
import { EnumEquipmentGrade, EnumMaterialId } from './equipment-data'
import { EquipmentService } from './equipment.service'
import {
  byEntity,
  itemRow,
  makeDataSource,
  makeEtm,
  PET_ID,
  petRow,
  USER,
} from './equipment-test-helpers'

const setup = () => {
  const etm = makeEtm()
  const dataSource = makeDataSource(etm)
  const monsterService = {
    getLiving: jest.fn().mockResolvedValue([]),
    lockAndTickLiving: jest.fn(),
  }
  const inventoryService = {
    add: jest.fn(),
    spend: jest.fn().mockResolvedValue(true),
    getInventory: jest.fn().mockResolvedValue({ items: [] }),
  }
  const walletService = { change: jest.fn().mockResolvedValue({ coin: 7 }) }
  const service = new EquipmentService(
    dataSource as never,
    monsterService as never,
    inventoryService as never,
    walletService as never
  )
  return { etm, inventoryService, walletService, service }
}

describe('EquipmentService.buyBox', () => {
  it('refuses and charges nothing when the bag is full', async () => {
    const { service, etm, walletService } = setup()
    etm.count.mockResolvedValue(EQUIPMENT_CAPACITY)
    await expect(service.buyBox(USER)).rejects.toThrow(
      new BadRequestException('Equipment bag is full')
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('charges the box price and returns the new piece', async () => {
    const { service, walletService } = setup()
    const result = await service.buyBox(USER)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -EQUIPMENT_BOX_PRICE,
      EnumWalletTransactionReason.EQUIPMENT_BOX,
      null,
      expect.anything()
    )
    expect(result.wallet).toEqual({ coin: 7 })
    expect(result.item.id).toBe('row-new')
  })
})

describe('EquipmentService.buyMaterial', () => {
  it.each(['nope', EnumMaterialId.CRAFT_FORGE_CORE])(
    'refuses %s (unknown or drop only)',
    async id => {
      const { service, walletService } = setup()
      await expect(service.buyMaterial(USER, id as EnumMaterialId)).rejects.toThrow(
        new NotFoundException('Material not found')
      )
      expect(walletService.change).not.toHaveBeenCalled()
    }
  )

  it('charges the material currency and adds it to the bag', async () => {
    const { service, walletService, inventoryService } = setup()
    inventoryService.getInventory.mockResolvedValue({ items: [{ itemId: 'x', quantity: 1 }] })
    const result = await service.buyMaterial(USER, EnumMaterialId.PROTECT_SCROLL)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.RAID_TOKEN,
      -6,
      EnumWalletTransactionReason.SHOP_PURCHASE,
      EnumMaterialId.PROTECT_SCROLL,
      expect.anything()
    )
    expect(inventoryService.add).toHaveBeenCalledWith(
      USER,
      EnumMaterialId.PROTECT_SCROLL,
      expect.anything()
    )
    expect(result).toEqual({ wallet: { coin: 7 }, items: [{ itemId: 'x', quantity: 1 }] })
  })

  it('pays for enhance stones in coins', async () => {
    const { service, walletService } = setup()
    await service.buyMaterial(USER, EnumMaterialId.ENHANCE_STONE)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -40,
      EnumWalletTransactionReason.SHOP_PURCHASE,
      EnumMaterialId.ENHANCE_STONE,
      expect.anything()
    )
  })
})

describe('EquipmentService.dismantle / dismantleMany', () => {
  it('rejects when any id is missing', async () => {
    const { service, etm } = setup()
    etm.find.mockResolvedValue([itemRow({ id: 'a' })])
    await expect(service.dismantleMany(USER, ['a', 'b'])).rejects.toThrow(
      new NotFoundException('Equipment not found')
    )
    expect(etm.softDelete).not.toHaveBeenCalled()
  })

  it('refuses the whole batch when a piece is worn', async () => {
    const { service, etm } = setup()
    etm.find.mockResolvedValue([itemRow({ id: 'a' }), itemRow({ id: 'b', equipped: true })])
    await expect(service.dismantleMany(USER, ['a', 'b'])).rejects.toThrow(
      new BadRequestException('Take the equipment off first')
    )
    expect(etm.softDelete).not.toHaveBeenCalled()
  })

  it('de-duplicates and sorts ids, pays stones and logs each piece', async () => {
    const { service, etm, inventoryService } = setup()
    etm.find.mockImplementation((entity: unknown) =>
      Promise.resolve(
        entity === EquipmentItemEntity
          ? [
              itemRow({ id: 'a', grade: EnumEquipmentGrade.RARE, enhanceLevel: 5 }),
              itemRow({ id: 'b', grade: EnumEquipmentGrade.COMMON, enhanceLevel: 0 }),
            ]
          : []
      )
    )
    const result = await service.dismantleMany(USER, ['b', 'a', 'b'])
    expect(etm.find).toHaveBeenCalledWith(
      EquipmentItemEntity,
      expect.objectContaining({ order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } })
    )
    // rare +5 = 2 + 1 stones and a rare refine stone; common +0 = 1 stone and a common refine stone.
    expect(result.gained).toEqual({
      [EnumMaterialId.ENHANCE_STONE]: 4,
      [EnumMaterialId.REFINE_RARE]: 1,
      [EnumMaterialId.REFINE_COMMON]: 1,
    })
    expect(inventoryService.add).toHaveBeenCalledWith(
      USER,
      EnumMaterialId.ENHANCE_STONE,
      expect.anything(),
      4
    )
    expect(inventoryService.add).toHaveBeenCalledTimes(3)
    const logs = etm.save.mock.calls.find(call => call[0] === EquipmentLogEntity)![1] as {
      type: EnumEquipmentLogType
      equipmentId: string
    }[]
    expect(logs.map(log => [log.equipmentId, log.type])).toEqual([
      ['a', EnumEquipmentLogType.DISMANTLE],
      ['b', EnumEquipmentLogType.DISMANTLE],
    ])
  })

  it('dismantle wraps a single id', async () => {
    const { service, etm } = setup()
    etm.find.mockImplementation((entity: unknown) =>
      Promise.resolve(entity === EquipmentItemEntity ? [itemRow({ id: 'a' })] : [])
    )
    const result = await service.dismantle(USER, 'a')
    expect(result.gained[EnumMaterialId.ENHANCE_STONE]).toBe(1)
  })
})

describe('EquipmentService.refine', () => {
  const prepare = (item: unknown, owned: Record<string, number> = {}) => {
    const ctx = setup()
    ctx.etm.findOne.mockImplementation(byEntity(new Map([[EquipmentItemEntity, item]])))
    ctx.inventoryService.getInventory.mockResolvedValue({
      items: Object.entries(owned).map(([itemId, quantity]) => ({ itemId, quantity })),
    })
    return ctx
  }

  it('rejects a missing piece', async () => {
    const { service } = prepare(null)
    await expect(service.refine(USER, 'item-1', 'hp')).rejects.toThrow(
      new NotFoundException('Equipment not found')
    )
  })

  it('rejects while a refine is pending', async () => {
    const { service } = prepare(itemRow({ pendingRefine: { key: 'hp', value: 1 } }))
    await expect(service.refine(USER, 'item-1', 'hp')).rejects.toThrow(
      new BadRequestException('Keep or discard the pending refine first')
    )
  })

  it('rejects a line the piece does not have', async () => {
    const { service } = prepare(itemRow())
    await expect(service.refine(USER, 'item-1', 'spd')).rejects.toThrow(
      new BadRequestException('Equipment has no such secondary stat')
    )
  })

  it('rejects without a covering stone and charges nothing', async () => {
    const { service, walletService } = prepare(itemRow())
    await expect(service.refine(USER, 'item-1', 'hp')).rejects.toThrow(
      new BadRequestException('No refine stone for this enhance level')
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('rejects when the stone cannot be spent after all', async () => {
    const { service, inventoryService } = prepare(itemRow(), { [EnumMaterialId.REFINE_COMMON]: 1 })
    inventoryService.spend.mockResolvedValue(false)
    await expect(service.refine(USER, 'item-1', 'hp')).rejects.toThrow(
      new BadRequestException('No refine stone for this enhance level')
    )
  })

  it('spends the lowest covering stone and coin, rolls and keeps the roll pending', async () => {
    const item = itemRow()
    const { service, etm, walletService, inventoryService } = prepare(item, {
      [EnumMaterialId.REFINE_COMMON]: 2,
      [EnumMaterialId.REFINE_RARE]: 1,
    })
    const result = await service.refine(USER, 'item-1', 'hp')
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -50,
      EnumWalletTransactionReason.REFINE,
      'item-1',
      expect.anything()
    )
    expect(inventoryService.spend).toHaveBeenCalledWith(
      USER,
      EnumMaterialId.REFINE_COMMON,
      1,
      expect.anything()
    )
    expect(result.pending).toEqual({ line: 'hp', oldValue: 5, newValue: item.pendingRefine!.value })
    expect(item.pendingRefine!.key).toBe('hp')
    expect(etm.save).toHaveBeenCalledWith(
      EquipmentLogEntity,
      expect.objectContaining({
        payload: expect.objectContaining({
          step: 'roll',
          line: 'hp',
          stone: 'refine_stone_common',
        }),
      })
    )
    expect(result.wallet).toEqual({ coin: 7 })
  })

  it('uses a higher tier for a high enhance level', async () => {
    const item = itemRow({ enhanceLevel: 9 })
    const { service, walletService } = prepare(item, { [EnumMaterialId.REFINE_EPIC]: 1 })
    await service.refine(USER, 'item-1', 'atk')
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -200,
      EnumWalletTransactionReason.REFINE,
      'item-1',
      expect.anything()
    )
  })
})

describe('EquipmentService.resolveRefine', () => {
  const pendingItem = (overrides = {}) =>
    itemRow({ pendingRefine: { key: 'hp', value: 9 }, ...overrides })

  const prepare = (item: unknown, wearer: unknown = null) => {
    const ctx = setup()
    ctx.etm.findOne.mockImplementation(
      byEntity(
        new Map<unknown, unknown>([
          [EquipmentItemEntity, item],
          [MonsterEntity, wearer],
        ])
      )
    )
    return ctx
  }

  it('rejects when nothing is pending', async () => {
    const { service } = prepare(itemRow())
    await expect(service.resolveRefine(USER, 'item-1', true)).rejects.toThrow(
      new BadRequestException('Nothing to resolve')
    )
  })

  it('keeping applies the new value on an unworn piece', async () => {
    const item = pendingItem()
    const { service, etm } = prepare(item)
    await service.resolveRefine(USER, 'item-1', true)
    expect(item.subStats).toEqual({ hp: 9, atk: 2 })
    expect(item.pendingRefine).toBeNull()
    expect(etm.findOne).not.toHaveBeenCalledWith(MonsterEntity, expect.anything())
    expect(etm.save).toHaveBeenCalledWith(
      EquipmentLogEntity,
      expect.objectContaining({
        payload: { step: 'keep', line: 'hp', oldValue: 5, newValue: 9 },
      })
    )
  })

  it('keeping on a piece worn by an exploring pet is refused', async () => {
    const { service } = prepare(
      pendingItem({ equipped: true, monsterId: PET_ID }),
      petRow({ expeditionAreaId: 'meadow' })
    )
    await expect(service.resolveRefine(USER, 'item-1', true)).rejects.toThrow(
      new BadRequestException('Monster is on an expedition')
    )
  })

  it('keeping on a piece worn by a resting pet works', async () => {
    const item = pendingItem({ equipped: true, monsterId: PET_ID })
    const { service } = prepare(item, petRow())
    await service.resolveRefine(USER, 'item-1', true)
    expect(item.subStats.hp).toBe(9)
  })

  it('keeping when the wearer row is gone still works', async () => {
    const item = pendingItem({ equipped: true, monsterId: PET_ID })
    const { service } = prepare(item, null)
    await service.resolveRefine(USER, 'item-1', true)
    expect(item.subStats.hp).toBe(9)
  })

  it('discarding keeps the old value even for an exploring wearer', async () => {
    const item = pendingItem({ equipped: true, monsterId: PET_ID })
    const { service, etm } = prepare(item, petRow({ expeditionAreaId: 'meadow' }))
    await service.resolveRefine(USER, 'item-1', false)
    expect(item.subStats.hp).toBe(5)
    expect(item.pendingRefine).toBeNull()
    expect(etm.save).toHaveBeenCalledWith(
      EquipmentLogEntity,
      expect.objectContaining({ payload: expect.objectContaining({ step: 'discard' }) })
    )
  })
})
