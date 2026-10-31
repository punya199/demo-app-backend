import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { InventoryService } from './inventory.service'
import { findShopItem, SHOP_ITEMS } from './shop-data'

@Injectable()
export class ShopService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  getItems() {
    return { items: SHOP_ITEMS }
  }

  async buy(userId: string, itemId: string) {
    const item = findShopItem(itemId)
    if (!item) {
      throw new NotFoundException('Item not found')
    }

    // Buying only fills the bag; the item is used later from the inventory.
    return this.dataSource.transaction(async etm => {
      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -item.price,
        EnumWalletTransactionReason.SHOP_PURCHASE,
        item.id,
        etm
      )
      await this.inventoryService.add(userId, item.id, etm)
      return { wallet, ...(await this.inventoryService.getInventory(userId, etm)) }
    })
  }
}
