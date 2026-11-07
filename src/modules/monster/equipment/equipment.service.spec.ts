import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EnumEquipmentLogType, EquipmentLogEntity } from '../../../db/entities/equipment-log.entity'
import { EquipmentItemEntity } from '../../../db/entities/equipment-item.entity'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import { PassiveAllocationEntity } from '../../../db/entities/passive-allocation.entity'
import { EQUIPMENT_CAPACITY } from '../core/monster-rules'
import { EnumEquipmentGrade, EnumEquipmentSlot, rollEquipment } from './equipment-data'
import {
  EquipmentService,
  grantEquipment,
  grantItem,
  isEquipmentBagFull,
  loadEquipmentBonus,
  rand,
  toEquipmentCore,
  toEquipmentView,
} from './equipment.service'
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
  const monsterService = { getLiving: jest.fn(), lockAndTickLiving: jest.fn() }
  const inventoryService = { add: jest.fn(), spend: jest.fn(), getInventory: jest.fn() }
  const walletService = { change: jest.fn() }
  const service = new EquipmentService(
    dataSource as never,
    monsterService as never,
    inventoryService as never,
    walletService as never
  )
  return { etm, dataSource, monsterService, inventoryService, walletService, service }
}

describe('equipment helpers', () => {
  it('rand stays in [0, 1)', () => {
    const value = rand()
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
  })

  it('toEquipmentCore copies the rule fields of a row', () => {
    const row = itemRow({ enhanceLevel: 3, setId: 'set-x' })
    expect(toEquipmentCore(row)).toEqual({
      templateId: 'unknown_template',
      slot: EnumEquipmentSlot.WEAPON,
      setId: 'set-x',
      grade: EnumEquipmentGrade.COMMON,
      mainValue: 10,
      subStats: { hp: 5, atk: 2 },
      specialOptions: [],
      enhanceLevel: 3,
    })
  })

  it('toEquipmentView falls back to the template id and a placeholder emoji', () => {
    const view = toEquipmentView(itemRow())
    expect(view.name).toBe('unknown_template')
    expect(view.emoji).toBe('❔')
    expect(view.mainStat).toBe('atk')
    expect(view.minStage).toBeNull()
  })

  it('toEquipmentView uses the real template name and enhanced main value', () => {
    const piece = rollEquipment(EnumEquipmentGrade.RARE, () => 0.5)
    const view = toEquipmentView(itemRow({ ...piece, enhanceLevel: 0 } as never))
    expect(view.name).not.toBe(piece.templateId)
    expect(view.emoji).not.toBe('❔')
    expect(view.minStage).toBe(EnumMonsterStage.ADULT)
  })

  it('isEquipmentBagFull compares the count with the capacity', async () => {
    const etm = makeEtm()
    etm.count
      .mockResolvedValueOnce(EQUIPMENT_CAPACITY - 1)
      .mockResolvedValueOnce(EQUIPMENT_CAPACITY)
    expect(await isEquipmentBagFull(USER, etm as never)).toBe(false)
    expect(await isEquipmentBagFull(USER, etm as never)).toBe(true)
  })

  it('grantItem returns null without saving when the bag is full', async () => {
    const etm = makeEtm()
    etm.count.mockResolvedValue(EQUIPMENT_CAPACITY)
    const item = rollEquipment(EnumEquipmentGrade.COMMON, () => 0.1)
    expect(await grantItem(USER, item, 'box', etm as never)).toBeNull()
    expect(etm.save).not.toHaveBeenCalled()
  })

  it('grantItem saves the piece unequipped and logs where it came from', async () => {
    const etm = makeEtm()
    const item = rollEquipment(EnumEquipmentGrade.COMMON, () => 0.1)
    const row = await grantItem(USER, item, 'box', etm as never)
    expect(row).toMatchObject({ id: 'row-new', userId: USER, equipped: false })
    expect(etm.save).toHaveBeenNthCalledWith(
      2,
      EquipmentLogEntity,
      expect.objectContaining({
        type: EnumEquipmentLogType.OBTAIN,
        equipmentId: 'row-new',
        payload: { source: 'box', grade: 'common', templateId: item.templateId },
      })
    )
  })

  it('grantEquipment rolls a piece of the requested grade', async () => {
    const etm = makeEtm()
    const row = await grantEquipment(USER, EnumEquipmentGrade.RARE, 'drop', etm as never)
    expect(row?.grade).toBe(EnumEquipmentGrade.RARE)
  })

  it('loadEquipmentBonus merges worn gear with the trainer passives', async () => {
    const etm = makeEtm()
    etm.find.mockResolvedValue([itemRow({ equipped: true, monsterId: PET_ID })])
    const bonus = await loadEquipmentBonus(USER, PET_ID, etm as never)
    expect(etm.find).toHaveBeenCalledWith(EquipmentItemEntity, {
      where: { monsterId: PET_ID, equipped: true },
    })
    expect(etm.findOne).toHaveBeenCalledWith(PassiveAllocationEntity, { where: { userId: USER } })
    expect(bonus).toBeDefined()
  })
})

describe('EquipmentService.getEquipment', () => {
  it('returns an empty screen when the player has no pet', async () => {
    const { service, etm, monsterService } = setup()
    monsterService.getLiving.mockResolvedValue([])
    const result = await service.getEquipment(USER, etm as never)
    expect(result).toMatchObject({
      capacity: EQUIPMENT_CAPACITY,
      items: [],
      monsterId: null,
      pets: [],
      stats: null,
      combat: null,
      arenaStats: null,
    })
  })

  it('has no stats for an egg', async () => {
    const { service, etm, monsterService } = setup()
    monsterService.getLiving.mockResolvedValue([petRow({ stage: EnumMonsterStage.EGG })])
    const result = await service.getEquipment(USER, etm as never)
    expect(result.monsterId).toBe(PET_ID)
    expect(result.stats).toBeNull()
    expect(result.arenaStats).toBeNull()
  })

  it('shows the selected pet with its worn gear and stats', async () => {
    const { service, etm, monsterService } = setup()
    const worn = itemRow({ id: 'a', equipped: true, monsterId: PET_ID })
    const other = itemRow({ id: 'b', equipped: true, monsterId: 'other-pet' })
    etm.find.mockResolvedValue([worn, other])
    monsterService.getLiving.mockResolvedValue([petRow(), petRow({ id: 'other-pet' })])
    const result = await service.getEquipment(USER, etm as never)
    expect(result.monsterId).toBe(PET_ID)
    expect(result.items.map(row => row.id)).toEqual(['a', 'b'])
    expect(result.pets).toHaveLength(2)
    expect(result.stats).not.toBeNull()
    expect(result.combat).not.toBeNull()
    expect(result.arenaStats).not.toBeNull()
    expect(result.bonus.flat.atk).toBeGreaterThan(0)
  })

  it('picks the requested pet and falls back to the default etm', async () => {
    const { service, etm, monsterService, dataSource } = setup()
    monsterService.getLiving.mockResolvedValue([petRow(), petRow({ id: 'other-pet' })])
    const result = await service.getEquipment(USER, undefined, 'other-pet')
    expect(result.monsterId).toBe('other-pet')
    expect(dataSource.manager).toBe(etm)
    expect(etm.find).toHaveBeenCalled()
  })

  it('ignores an unknown monsterId', async () => {
    const { service, etm, monsterService } = setup()
    monsterService.getLiving.mockResolvedValue([petRow()])
    const result = await service.getEquipment(USER, etm as never, 'missing')
    expect(result.monsterId).toBeNull()
  })
})

describe('EquipmentService.equip / unequip', () => {
  const prepare = (pets: unknown[], item: unknown) => {
    const ctx = setup()
    ctx.monsterService.lockAndTickLiving.mockResolvedValue(pets)
    ctx.monsterService.getLiving.mockResolvedValue(pets)
    ctx.etm.findOne.mockImplementation(byEntity(new Map([[EquipmentItemEntity, item]])))
    return ctx
  }

  it('rejects an unknown pet', async () => {
    const { service } = prepare([], itemRow())
    await expect(service.equip(USER, 'item-1', 'nope')).rejects.toThrow(
      new NotFoundException('Monster not found')
    )
  })

  it('rejects a missing item', async () => {
    const { service } = prepare([petRow()], null)
    await expect(service.equip(USER, 'item-1')).rejects.toThrow(
      new NotFoundException('Equipment not found')
    )
  })

  it('refuses a piece another pet wears unless move is set', async () => {
    const item = itemRow({ equipped: true, monsterId: 'other-pet' })
    const { service } = prepare([petRow(), petRow({ id: 'other-pet' })], item)
    await expect(service.equip(USER, 'item-1', PET_ID)).rejects.toThrow(
      new BadRequestException('Equipment is worn by another monster')
    )
  })

  it('refuses while the target or the previous wearer is on an expedition', async () => {
    const away = petRow({ expeditionAreaId: 'meadow' })
    const first = prepare([away], itemRow())
    await expect(first.service.equip(USER, 'item-1')).rejects.toThrow(
      new BadRequestException('Monster is on an expedition')
    )
    const item = itemRow({ equipped: true, monsterId: 'other-pet' })
    const second = prepare(
      [petRow(), petRow({ id: 'other-pet', expeditionAreaId: 'meadow' })],
      item
    )
    await expect(second.service.equip(USER, 'item-1', PET_ID, true)).rejects.toThrow(
      new BadRequestException('Monster is on an expedition')
    )
  })

  it('refuses a piece the pet is too young to wear', async () => {
    const item = itemRow({ grade: EnumEquipmentGrade.EPIC })
    const { service } = prepare([petRow({ stage: EnumMonsterStage.BABY_1 })], item)
    await expect(service.equip(USER, 'item-1')).rejects.toThrow(
      new BadRequestException('Monster is too young to wear this equipment')
    )
  })

  it('wears a bag piece: frees the slot, saves, logs and returns the screen', async () => {
    const item = itemRow()
    const { service, etm } = prepare([petRow()], item)
    const result = await service.equip(USER, 'item-1')
    expect(etm.update).toHaveBeenCalledWith(
      EquipmentItemEntity,
      { monsterId: PET_ID, slot: EnumEquipmentSlot.WEAPON, equipped: true },
      { equipped: false, monsterId: null }
    )
    expect(etm.save).toHaveBeenCalledWith(
      EquipmentItemEntity,
      expect.objectContaining({ equipped: true, monsterId: PET_ID })
    )
    expect(etm.save).toHaveBeenCalledWith(EquipmentLogEntity, {
      userId: USER,
      equipmentId: 'item-1',
      type: EnumEquipmentLogType.EQUIP,
      payload: { slot: 'weapon', monsterId: PET_ID, from: null },
    })
    expect(result.monsterId).toBe(PET_ID)
  })

  it('moves a piece from another pet and records where it came from', async () => {
    const item = itemRow({ equipped: true, monsterId: 'other-pet' })
    const { service, etm } = prepare([petRow(), petRow({ id: 'other-pet' })], item)
    await service.equip(USER, 'item-1', PET_ID, true)
    expect(etm.save).toHaveBeenCalledWith(
      EquipmentLogEntity,
      expect.objectContaining({ payload: { slot: 'weapon', monsterId: PET_ID, from: 'other-pet' } })
    )
  })

  it('does nothing when the pet already wears the piece', async () => {
    const item = itemRow({ equipped: true, monsterId: PET_ID })
    const { service, etm } = prepare([petRow()], item)
    await service.equip(USER, 'item-1')
    expect(etm.update).not.toHaveBeenCalled()
    expect(etm.save).not.toHaveBeenCalled()
  })

  it('unequip rejects an unknown pet and an exploring pet', async () => {
    const none = prepare([], null)
    await expect(none.service.unequip(USER, EnumEquipmentSlot.ARMOR)).rejects.toThrow(
      new NotFoundException('Monster not found')
    )
    const away = prepare([petRow({ expeditionAreaId: 'meadow' })], null)
    await expect(away.service.unequip(USER, EnumEquipmentSlot.ARMOR)).rejects.toThrow(
      new BadRequestException('Monster is on an expedition')
    )
  })

  it('unequip logs only when something was actually taken off', async () => {
    const worn = prepare([petRow()], null)
    await worn.service.unequip(USER, EnumEquipmentSlot.ARMOR, PET_ID)
    expect(worn.etm.save).toHaveBeenCalledWith(EquipmentLogEntity, {
      userId: USER,
      equipmentId: null,
      type: EnumEquipmentLogType.UNEQUIP,
      payload: { slot: 'armor', monsterId: PET_ID },
    })
    const empty = prepare([petRow()], null)
    empty.etm.update.mockResolvedValue({ affected: 0 })
    await empty.service.unequip(USER, EnumEquipmentSlot.ARMOR)
    expect(empty.etm.save).not.toHaveBeenCalled()
  })

  it('lockItem scopes the lookup to the owner with a write lock', async () => {
    const { service, etm } = prepare([petRow()], itemRow())
    await service.equip(USER, 'item-1')
    expect(etm.findOne).toHaveBeenCalledWith(EquipmentItemEntity, {
      where: { id: 'item-1', userId: USER },
      lock: { mode: 'pessimistic_write' },
    })
  })
})
