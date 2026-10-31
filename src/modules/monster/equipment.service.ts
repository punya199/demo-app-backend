import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { EnumEquipmentLogType, EquipmentLogEntity } from '../../db/entities/equipment-log.entity'
import { EquipmentItemEntity } from '../../db/entities/equipment-item.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { toFighter } from './battle-stats'
import {
  BOX_GRADE_RATES,
  calcEquipmentBonus,
  calcSetBonuses,
  DISMANTLE_STONES,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  EnumMaterialId,
  findEquipmentTemplate,
  findMaterial,
  getItemStats,
  IEquipmentItem,
  mainValueAt,
  rollEquipment,
  rollGrade,
  SLOT_MAIN_STAT,
} from './equipment-data'
import { InventoryService } from './inventory.service'
import { EQUIPMENT_BOX_PRICE, EQUIPMENT_CAPACITY } from './monster-rules'
import { MonsterService } from './monster.service'

const rand = () => randomInt(0, 1_000_000) / 1_000_000

export const toEquipmentCore = (row: EquipmentItemEntity): IEquipmentItem => ({
  templateId: row.templateId,
  slot: row.slot as EnumEquipmentSlot,
  setId: row.setId,
  grade: row.grade as EnumEquipmentGrade,
  mainValue: row.mainValue,
  subStats: row.subStats,
  enhanceLevel: row.enhanceLevel,
})

export const toEquipmentView = (row: EquipmentItemEntity) => {
  const template = findEquipmentTemplate(row.templateId)
  const core = toEquipmentCore(row)
  return {
    id: row.id,
    templateId: row.templateId,
    name: template?.name ?? row.templateId,
    emoji: template?.emoji ?? '❔',
    slot: row.slot,
    setId: row.setId,
    grade: row.grade,
    mainStat: SLOT_MAIN_STAT[core.slot].stat,
    mainValue: mainValueAt(row.mainValue, row.enhanceLevel),
    subStats: row.subStats,
    stats: getItemStats(core),
    enhanceLevel: row.enhanceLevel,
    pity: row.pity,
    equipped: row.equipped,
  }
}

// The monster stats bonus from everything the user currently wears.
export const loadEquipmentBonus = async (userId: string, etm: EntityManager) => {
  const worn = await etm.find(EquipmentItemEntity, { where: { userId, equipped: true } })
  return calcEquipmentBonus(worn.map(toEquipmentCore))
}

// Adds a freshly rolled piece to the user's bag unless it is full. Returns null when full.
export const grantEquipment = async (
  userId: string,
  grade: EnumEquipmentGrade,
  source: string,
  etm: EntityManager
) => {
  const count = await etm.count(EquipmentItemEntity, { where: { userId } })
  if (count >= EQUIPMENT_CAPACITY) {
    return null
  }
  const rolled = rollEquipment(grade, rand)
  const row = await etm.save(EquipmentItemEntity, { userId, ...rolled, equipped: false })
  await etm.save(EquipmentLogEntity, {
    userId,
    equipmentId: row.id,
    type: EnumEquipmentLogType.OBTAIN,
    payload: { source, grade, templateId: row.templateId },
  })
  return row
}

@Injectable()
export class EquipmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  async getEquipment(userId: string, etm: EntityManager = this.dataSource.manager) {
    const rows = await etm.find(EquipmentItemEntity, {
      where: { userId },
      order: { createdAt: 'DESC' },
    })
    const worn = rows.filter(row => row.equipped).map(toEquipmentCore)
    const monster = await this.monsterService.getLatestAlive(userId, etm)
    return {
      capacity: EQUIPMENT_CAPACITY,
      items: rows.map(toEquipmentView),
      setBonuses: calcSetBonuses(worn),
      bonus: calcEquipmentBonus(worn),
      // The living monster's battle stats with the worn gear; null without a hatched monster.
      stats: monster ? toFighter(monster, calcEquipmentBonus(worn)).stats : null,
    }
  }

  private async lockItem(userId: string, equipmentId: string, etm: EntityManager) {
    const item = await etm.findOne(EquipmentItemEntity, {
      where: { id: equipmentId, userId },
      lock: { mode: 'pessimistic_write' },
    })
    if (!item) {
      throw new NotFoundException('Equipment not found')
    }
    return item
  }

  // Gear can't change while the monster is away, or an expedition could be re-geared for rate.
  private async assertHome(userId: string, now: Date, etm: EntityManager) {
    const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
    if (monster && !monster.diedAt && monster.expeditionAreaId) {
      throw new BadRequestException('Monster is on an expedition')
    }
  }

  async equip(userId: string, equipmentId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      await this.assertHome(userId, now, etm)
      const item = await this.lockItem(userId, equipmentId, etm)
      if (!item.equipped) {
        // Free the slot first: the unique index allows one worn piece per slot.
        await etm.update(
          EquipmentItemEntity,
          { userId, slot: item.slot, equipped: true },
          { equipped: false }
        )
        item.equipped = true
        await etm.save(EquipmentItemEntity, item)
        await etm.save(EquipmentLogEntity, {
          userId,
          equipmentId,
          type: EnumEquipmentLogType.EQUIP,
          payload: { slot: item.slot },
        })
      }
      return this.getEquipment(userId, etm)
    })
  }

  async unequip(userId: string, slot: EnumEquipmentSlot) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      await this.assertHome(userId, now, etm)
      const result = await etm.update(
        EquipmentItemEntity,
        { userId, slot, equipped: true },
        { equipped: false }
      )
      if (result.affected) {
        await etm.save(EquipmentLogEntity, {
          userId,
          equipmentId: null,
          type: EnumEquipmentLogType.UNEQUIP,
          payload: { slot },
        })
      }
      return this.getEquipment(userId, etm)
    })
  }

  // Charges for the box only if the bag has room, so a full bag never costs coins.
  async buyBox(userId: string) {
    return this.dataSource.transaction(async etm => {
      const count = await etm.count(EquipmentItemEntity, { where: { userId } })
      if (count >= EQUIPMENT_CAPACITY) {
        throw new BadRequestException('Equipment bag is full')
      }
      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -EQUIPMENT_BOX_PRICE,
        EnumWalletTransactionReason.EQUIPMENT_BOX,
        null,
        etm
      )
      const row = (await grantEquipment(userId, rollGrade(BOX_GRADE_RATES, rand()), 'box', etm))!
      return { wallet, item: toEquipmentView(row) }
    })
  }

  async buyMaterial(userId: string, materialId: EnumMaterialId) {
    const material = findMaterial(materialId)
    if (!material) {
      throw new NotFoundException('Material not found')
    }
    return this.dataSource.transaction(async etm => {
      const wallet = await this.walletService.change(
        userId,
        material.currency === 'gem' ? EnumWalletCurrency.GEM : EnumWalletCurrency.COIN,
        -material.price,
        EnumWalletTransactionReason.SHOP_PURCHASE,
        material.id,
        etm
      )
      await this.inventoryService.add(userId, material.id, etm)
      return { wallet, ...(await this.inventoryService.getInventory(userId, etm)) }
    })
  }

  // Only a piece that isn't worn can be dismantled, so a worn one can't be lost by a stray click.
  async dismantle(userId: string, equipmentId: string) {
    return this.dataSource.transaction(async etm => {
      const item = await this.lockItem(userId, equipmentId, etm)
      if (item.equipped) {
        throw new BadRequestException('Take the equipment off first')
      }
      const stones =
        DISMANTLE_STONES[item.grade as EnumEquipmentGrade] + Math.floor(item.enhanceLevel / 2)
      await etm.softDelete(EquipmentItemEntity, { id: item.id })
      await this.inventoryService.add(userId, EnumMaterialId.ENHANCE_STONE, etm, stones)
      await etm.save(EquipmentLogEntity, {
        userId,
        equipmentId,
        type: EnumEquipmentLogType.DISMANTLE,
        payload: { stones, grade: item.grade, enhanceLevel: item.enhanceLevel },
      })
      return { gained: { enhance_stone: stones }, ...(await this.getEquipment(userId, etm)) }
    })
  }
}
