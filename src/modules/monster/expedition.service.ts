import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource } from 'typeorm'
import { AdventureProgressEntity } from '../../db/entities/adventure-progress.entity'
import { EnumMonsterStage } from '../../db/entities/monster.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { ADVENTURE_AREAS, isStageUnlocked } from './adventure-data'
import { toFighter } from './battle-stats'
import { EnumMaterialId } from './equipment-data'
import { loadEquipmentBonus } from './equipment.service'
import {
  calcExpeditionCoins,
  calcExpeditionDrops,
  calcExpeditionStones,
  EXPEDITION_DROP_ITEMS,
  findExpeditionArea,
  getExpeditionBaseRate,
  getExpeditionRate,
} from './idle-data'
import { InventoryService } from './inventory.service'
import { claimExpedition, startExpedition } from './monster-engine'
import { EXPEDITION_MAX_MINUTES } from './monster-rules'
import { toMonsterView, withRuleErrors, MonsterService } from './monster.service'

@Injectable()
export class ExpeditionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  // Areas open like adventure areas do: once the stage before the area's first one is cleared.
  private async getUnlockedAreaIds(userId: string, etm = this.dataSource.manager) {
    const progress = await etm.find(AdventureProgressEntity, { where: { userId } })
    const cleared = new Set(progress.map(row => row.stageId))
    return ADVENTURE_AREAS.filter(area => isStageUnlocked(area.stages[0].id, cleared)).map(
      area => area.id
    )
  }

  async getExpedition(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      const unlocked = new Set(await this.getUnlockedAreaIds(userId, etm))
      const stats =
        monster && !monster.diedAt && monster.stage !== EnumMonsterStage.EGG
          ? toFighter(monster, await loadEquipmentBonus(userId, etm)).stats
          : null
      return {
        maxMinutes: EXPEDITION_MAX_MINUTES,
        areas: ADVENTURE_AREAS.filter(area => findExpeditionArea(area.id)).map(area => ({
          id: area.id,
          name: area.name,
          emoji: area.emoji,
          unlocked: unlocked.has(area.id),
          baseRatePerHour: getExpeditionBaseRate(area.id),
          // What this monster would earn right now; null without a hatched monster.
          ratePerHour: stats ? getExpeditionRate(area, stats) : null,
        })),
      }
    })
  }

  async start(userId: string, areaId: string) {
    const now = new Date()
    const area = findExpeditionArea(areaId)
    if (!area) {
      throw new NotFoundException('Area not found')
    }

    return this.dataSource.transaction(async etm => {
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }
      if (!(await this.getUnlockedAreaIds(userId, etm)).includes(areaId)) {
        throw new BadRequestException('Area is locked')
      }

      const equipment = await loadEquipmentBonus(userId, etm)
      const result = withRuleErrors(() =>
        startExpedition(
          monster,
          areaId,
          getExpeditionRate(area, toFighter(monster, equipment).stats),
          now
        )
      )
      const saved = await this.monsterService.saveState(monster, result.state, etm)
      await this.monsterService.saveEvents(saved, result.events, etm)
      return { monster: toMonsterView(saved) }
    })
  }

  // Collects whatever the monster has gathered so far - also works mid-trip ("recall").
  async claim(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }

      // Rewards come from minutes the server counted, never from anything the client sends.
      const coins = calcExpeditionCoins(monster.expeditionMinutes, monster.expeditionRate)
      const items = Array.from({ length: calcExpeditionDrops(monster.expeditionMinutes) }, () => {
        return EXPEDITION_DROP_ITEMS[randomInt(0, EXPEDITION_DROP_ITEMS.length)] as string
      })
      // Enhance stones are a steady yield; the consumable drops above are the lucky extras.
      items.push(
        ...Array<string>(calcExpeditionStones(monster.expeditionMinutes)).fill(
          EnumMaterialId.ENHANCE_STONE
        )
      )
      const result = withRuleErrors(() => claimExpedition(monster, { coins, items }, now))
      const saved = await this.monsterService.saveState(monster, result.state, etm)
      await this.monsterService.saveEvents(saved, result.events, etm)

      let wallet = await this.walletService.getBalance(userId, etm)
      if (coins > 0) {
        wallet = await this.walletService.change(
          userId,
          EnumWalletCurrency.COIN,
          coins,
          EnumWalletTransactionReason.EXPEDITION_REWARD,
          monster.expeditionAreaId,
          etm
        )
      }
      const counts = new Map<string, number>()
      for (const itemId of items) {
        counts.set(itemId, (counts.get(itemId) ?? 0) + 1)
      }
      for (const [itemId, quantity] of counts) {
        await this.inventoryService.add(userId, itemId, etm, quantity)
      }
      return {
        monster: toMonsterView(saved),
        wallet,
        summary: {
          areaId: monster.expeditionAreaId,
          minutes: monster.expeditionMinutes,
          coins,
          items,
        },
      }
    })
  }
}
