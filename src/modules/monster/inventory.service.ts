import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { InventoryItemEntity } from '../../db/entities/inventory-item.entity'
import { applyShopItem } from './monster-engine'
import { toMonsterView, withRuleErrors, MonsterService } from './monster.service'
import { EnumShopItemId } from './shop-data'

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService
  ) {}

  async getInventory(userId: string, etm: EntityManager = this.dataSource.manager) {
    const rows = await etm.find(InventoryItemEntity, { where: { userId } })
    return {
      items: rows
        .filter(row => row.quantity > 0)
        .map(row => ({ itemId: row.itemId, quantity: row.quantity })),
    }
  }

  // Atomic increment: concurrent purchases of the same item can't lose a count.
  async add(userId: string, itemId: string, etm: EntityManager) {
    await etm.query(
      `INSERT INTO "inventory_items" ("user_id", "item_id", "quantity") VALUES ($1, $2, 1)
       ON CONFLICT ("user_id", "item_id") WHERE deleted_at IS NULL
       DO UPDATE SET "quantity" = "inventory_items"."quantity" + 1, "updated_at" = now()`,
      [userId, itemId]
    )
  }

  async use(userId: string, itemId: EnumShopItemId) {
    const now = new Date()

    return this.dataSource.transaction(async etm => {
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }

      // Check the item works on this monster before taking it out of the bag.
      const result = withRuleErrors(() => applyShopItem(monster, itemId, now))
      const taken = await etm
        .createQueryBuilder()
        .update(InventoryItemEntity)
        .set({ quantity: () => 'quantity - 1' })
        .where('user_id = :userId AND item_id = :itemId AND quantity > 0', { userId, itemId })
        .execute()
      if (!taken.affected) {
        throw new BadRequestException('You do not have this item')
      }

      const saved = await this.monsterService.saveState(monster, result.state, etm)
      await this.monsterService.saveEvents(saved, result.events, etm)
      return { monster: toMonsterView(saved), ...(await this.getInventory(userId, etm)) }
    })
  }
}
