import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { applyShopItem } from './monster-engine'
import { toMonsterView, withRuleErrors, MonsterService } from './monster.service'
import { findShopItem, SHOP_ITEMS } from './shop-data'

@Injectable()
export class ShopService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly walletService: WalletService
  ) {}

  getItems() {
    return { items: SHOP_ITEMS }
  }

  async buy(userId: string, itemId: string) {
    const now = new Date()
    const item = findShopItem(itemId)
    if (!item) {
      throw new NotFoundException('Item not found')
    }

    return this.dataSource.transaction(async etm => {
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }

      // Check the item can be used before charging for it.
      const result = withRuleErrors(() => applyShopItem(monster, item.id, now))
      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -item.price,
        EnumWalletTransactionReason.SHOP_PURCHASE,
        item.id,
        etm
      )
      const saved = await this.monsterService.saveState(monster, result.state, etm)
      await this.monsterService.saveEvents(saved, result.events, etm)
      return { monster: toMonsterView(saved), wallet }
    })
  }
}
