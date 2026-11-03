import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { EnumEquipmentLogType, EquipmentLogEntity } from '../../db/entities/equipment-log.entity'
import { EquipmentItemEntity } from '../../db/entities/equipment-item.entity'
import { EnumMonsterStage } from '../../db/entities/monster.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { toFighter } from './battle-stats'
import { combatTotals } from './monster-potential'
import {
  BOX_GRADE_RATES,
  calcEquipmentBonus,
  canEquip,
  ISpecialOption,
  calcSetBonuses,
  calcSetProgress,
  DISMANTLE_STONES,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  EnumMaterialId,
  findEquipmentTemplate,
  findMaterial,
  getItemStats,
  IEquipmentItem,
  mainValueAt,
  MIN_STAGE_BY_GRADE,
  rollEquipment,
  rollGrade,
  SLOT_MAIN_STAT,
} from './equipment-data'
import { InventoryService } from './inventory.service'
import { getSpecies } from './species-data'
import { mergeCombatBonus } from './passive-data'
import {
  EQUIPMENT_BOX_PRICE,
  EQUIPMENT_CAPACITY,
  SET_ENHANCE_MULTIPLIER,
  SET_ENHANCE_THRESHOLD,
} from './monster-rules'
import { MonsterService } from './monster.service'
import { loadPassiveBonus } from './passive.service'

const MATERIAL_CURRENCY = {
  coin: EnumWalletCurrency.COIN,
  gem: EnumWalletCurrency.GEM,
  raid_token: EnumWalletCurrency.RAID_TOKEN,
} as const

export const rand = () => randomInt(0, 1_000_000) / 1_000_000

export const toEquipmentCore = (row: EquipmentItemEntity): IEquipmentItem => ({
  templateId: row.templateId,
  slot: row.slot as EnumEquipmentSlot,
  setId: row.setId,
  grade: row.grade as EnumEquipmentGrade,
  mainValue: row.mainValue,
  subStats: row.subStats,
  specialOptions: row.specialOptions as ISpecialOption[],
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
    specialOptions: row.specialOptions,
    // The youngest form that may put it on (null = any); the screen locks it for younger pets.
    minStage: MIN_STAGE_BY_GRADE[row.grade as EnumEquipmentGrade],
    stats: getItemStats(core),
    enhanceLevel: row.enhanceLevel,
    pity: row.pity,
    equipped: row.equipped,
    // The pet wearing it (null in the bag).
    monsterId: row.monsterId,
  }
}

// The stats bonus for one pet: what it wears, plus the player's trainer passives.
export const loadEquipmentBonus = async (userId: string, monsterId: string, etm: EntityManager) => {
  const worn = await etm.find(EquipmentItemEntity, { where: { monsterId, equipped: true } })
  // Trainer passives ride along with the gear, so every fight and snapshot includes them.
  return mergeCombatBonus(
    calcEquipmentBonus(worn.map(toEquipmentCore)),
    (await loadPassiveBonus(userId, etm)).combat
  )
}

export const isEquipmentBagFull = async (userId: string, etm: EntityManager) =>
  (await etm.count(EquipmentItemEntity, { where: { userId } })) >= EQUIPMENT_CAPACITY

// Adds a piece to the user's bag unless it is full, and logs where it came from. Returns null when
// full. Callers that charge for the piece check isEquipmentBagFull first so a full bag costs nothing.
export const grantItem = async (
  userId: string,
  item: IEquipmentItem,
  source: string,
  etm: EntityManager
) => {
  if (await isEquipmentBagFull(userId, etm)) {
    return null
  }
  const row = await etm.save(EquipmentItemEntity, { userId, ...item, equipped: false })
  await etm.save(EquipmentLogEntity, {
    userId,
    equipmentId: row.id,
    type: EnumEquipmentLogType.OBTAIN,
    payload: { source, grade: item.grade, templateId: row.templateId },
  })
  return row
}

// Rolls a plain piece of the grade and adds it to the bag.
export const grantEquipment = (
  userId: string,
  grade: EnumEquipmentGrade,
  source: string,
  etm: EntityManager
) => grantItem(userId, rollEquipment(grade, rand), source, etm)

@Injectable()
export class EquipmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  // The gear screen for one pet (the selected one unless `monsterId` is given): its worn pieces
  // are the items whose `monsterId` is its id; pieces worn by another pet say so.
  async getEquipment(
    userId: string,
    etm: EntityManager = this.dataSource.manager,
    monsterId?: string
  ) {
    const rows = await etm.find(EquipmentItemEntity, {
      where: { userId },
      order: { createdAt: 'DESC' },
    })
    const living = await this.monsterService.getLiving(userId, etm)
    const pet = (monsterId ? living.find(row => row.id === monsterId) : living[0]) ?? null
    const worn = rows.filter(row => row.equipped && row.monsterId === pet?.id).map(toEquipmentCore)
    const fighter =
      pet && pet.stage !== EnumMonsterStage.EGG
        ? toFighter(
            pet,
            mergeCombatBonus(calcEquipmentBonus(worn), (await loadPassiveBonus(userId, etm)).combat)
          )
        : null
    return {
      capacity: EQUIPMENT_CAPACITY,
      items: rows.map(toEquipmentView),
      // The pet this screen is about, and every living pet so a piece can say who wears it.
      monsterId: pet?.id ?? null,
      pets: living.map(row => ({
        id: row.id,
        name: getSpecies(row.speciesId).name,
        emoji: getSpecies(row.speciesId).emoji,
      })),
      setBonuses: calcSetBonuses(worn),
      // Every set with the pieces this pet wears, and its bonus tiers (the client only displays).
      sets: calcSetProgress(worn),
      enhance: { threshold: SET_ENHANCE_THRESHOLD, multiplier: SET_ENHANCE_MULTIPLIER },
      // Special battle effects the worn sets give (burn, shield, regen, double strike).
      activeEffects: calcEquipmentBonus(worn).effects,
      bonus: calcEquipmentBonus(worn),
      // The pet's battle stats with its worn gear and the passives, and its crit rate, crit damage
      // and evasion; null for an egg or without a pet.
      stats: fighter?.stats ?? null,
      combat: fighter ? combatTotals(fighter.effects) : null,
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

  // Gear can't change while a pet is away, or an expedition could be re-geared for rate: neither
  // the pet getting a piece nor the pet losing one may be exploring. A piece belongs to one pet at
  // a time: taking it from another pet needs `move` (the screen's "move it here" after a confirm).
  async equip(userId: string, equipmentId: string, monsterId?: string, move = false) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const living = await this.monsterService.lockAndTickLiving(userId, now, etm)
      const pet = monsterId ? living.find(row => row.id === monsterId) : living[0]
      if (!pet) {
        throw new NotFoundException('Monster not found')
      }
      const item = await this.lockItem(userId, equipmentId, etm)
      const previous = living.find(row => row.id === item.monsterId)
      if (item.equipped && previous && previous.id !== pet.id && !move) {
        throw new BadRequestException('Equipment is worn by another monster')
      }
      if ([pet, previous].some(row => row?.expeditionAreaId)) {
        throw new BadRequestException('Monster is on an expedition')
      }
      if (!(item.equipped && item.monsterId === pet.id)) {
        if (!canEquip(pet.stage, item.grade as EnumEquipmentGrade)) {
          throw new BadRequestException('Monster is too young to wear this equipment')
        }
        // Free the slot first: the unique index allows one worn piece per pet and slot.
        await etm.update(
          EquipmentItemEntity,
          { monsterId: pet.id, slot: item.slot, equipped: true },
          { equipped: false, monsterId: null }
        )
        item.equipped = true
        item.monsterId = pet.id
        await etm.save(EquipmentItemEntity, item)
        await etm.save(EquipmentLogEntity, {
          userId,
          equipmentId,
          type: EnumEquipmentLogType.EQUIP,
          payload: { slot: item.slot, monsterId: pet.id, from: previous?.id ?? null },
        })
      }
      return this.getEquipment(userId, etm, pet.id)
    })
  }

  async unequip(userId: string, slot: EnumEquipmentSlot, monsterId?: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const living = await this.monsterService.lockAndTickLiving(userId, now, etm)
      const pet = monsterId ? living.find(row => row.id === monsterId) : living[0]
      if (!pet) {
        throw new NotFoundException('Monster not found')
      }
      if (pet.expeditionAreaId) {
        throw new BadRequestException('Monster is on an expedition')
      }
      const result = await etm.update(
        EquipmentItemEntity,
        { monsterId: pet.id, slot, equipped: true },
        { equipped: false, monsterId: null }
      )
      if (result.affected) {
        await etm.save(EquipmentLogEntity, {
          userId,
          equipmentId: null,
          type: EnumEquipmentLogType.UNEQUIP,
          payload: { slot, monsterId: pet.id },
        })
      }
      return this.getEquipment(userId, etm, pet.id)
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
        MATERIAL_CURRENCY[material.currency],
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
