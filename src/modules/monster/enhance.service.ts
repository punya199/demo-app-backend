import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource } from 'typeorm'
import { EnhanceLogEntity } from '../../db/entities/enhance-log.entity'
import { EquipmentItemEntity } from '../../db/entities/equipment-item.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { EnumMaterialId } from './equipment-data'
import {
  canProtect,
  effectiveRate,
  getEnhanceStep,
  MAX_ENHANCE_LEVEL,
  resolveEnhance,
} from './enhance-engine'
import { EquipmentService, toEquipmentView } from './equipment.service'
import { InventoryService } from './inventory.service'

const rand = () => randomInt(0, 1_000_000) / 1_000_000

@Injectable()
export class EnhanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly equipmentService: EquipmentService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  // The rate shown is the one the roll will really use, pity included.
  async getPreview(userId: string, equipmentId: string) {
    const item = await this.dataSource.manager.findOne(EquipmentItemEntity, {
      where: { id: equipmentId, userId },
    })
    if (!item) {
      throw new NotFoundException('Equipment not found')
    }
    if (item.enhanceLevel >= MAX_ENHANCE_LEVEL) {
      return { maxed: true, item: toEquipmentView(item) }
    }
    const step = getEnhanceStep(item.enhanceLevel)
    return {
      maxed: false,
      item: toEquipmentView(item),
      targetLevel: step.level,
      baseRate: step.rate,
      rate: effectiveRate(step, item.pity),
      onFail: step.onFail,
      canProtect: canProtect(item.enhanceLevel),
      cost: { coin: step.coin, stones: step.stones },
    }
  }

  async enhance(userId: string, equipmentId: string, useProtect: boolean) {
    return this.dataSource.transaction(async etm => {
      const item = await etm.findOne(EquipmentItemEntity, {
        where: { id: equipmentId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!item) {
        throw new NotFoundException('Equipment not found')
      }
      if (item.enhanceLevel >= MAX_ENHANCE_LEVEL) {
        throw new BadRequestException('Equipment is already at the maximum level')
      }
      if (useProtect && !canProtect(item.enhanceLevel)) {
        throw new BadRequestException('A protect scroll is not needed at this level')
      }

      // Rules are checked; now charge. Any shortfall throws and rolls the whole attempt back.
      const step = getEnhanceStep(item.enhanceLevel)
      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -step.coin,
        EnumWalletTransactionReason.ENHANCE,
        item.id,
        etm
      )
      if (
        !(await this.inventoryService.spend(userId, EnumMaterialId.ENHANCE_STONE, step.stones, etm))
      ) {
        throw new BadRequestException('Not enough enhance stones')
      }
      // Take the scroll before rolling: checking after would let a failed roll "roll back" for
      // free when the player has none. It is given back below if it turns out not to be needed.
      if (
        useProtect &&
        !(await this.inventoryService.spend(userId, EnumMaterialId.PROTECT_SCROLL, 1, etm))
      ) {
        throw new BadRequestException('You do not have a protect scroll')
      }
      const result = resolveEnhance(item.enhanceLevel, item.pity, useProtect, rand)
      if (useProtect && !result.protectUsed) {
        await this.inventoryService.add(userId, EnumMaterialId.PROTECT_SCROLL, etm)
      }

      const fromLevel = item.enhanceLevel
      const pityBefore = item.pity
      item.enhanceLevel = result.newLevel
      item.pity = result.newPity
      if (result.broke) {
        item.equipped = false
        await etm.save(EquipmentItemEntity, item)
        await etm.softDelete(EquipmentItemEntity, { id: item.id })
      } else {
        await etm.save(EquipmentItemEntity, item)
      }
      await etm.save(EnhanceLogEntity, {
        userId,
        equipmentId: item.id,
        fromLevel,
        toLevel: result.newLevel,
        rate: result.rate,
        success: result.success,
        broke: result.broke,
        pityBefore,
        cost: {
          coin: step.coin,
          stones: step.stones,
          protectUsed: result.protectUsed,
        },
      })

      return {
        result: {
          success: result.success,
          broke: result.broke,
          rate: result.rate,
          fromLevel,
          toLevel: result.newLevel,
          protectUsed: result.protectUsed,
        },
        wallet,
        equipment: await this.equipmentService.getEquipment(userId, etm),
        inventory: (await this.inventoryService.getInventory(userId, etm)).items,
      }
    })
  }
}
