import { NotFoundException } from '@nestjs/common'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { EnumShopItemId, findShopItem, SHOP_ITEMS } from './shop-data'
import { ShopController } from './shop.controller'
import { ShopService } from './shop.service'
import { makeDataSource, makeEtm, USER } from './equipment-test-helpers'

describe('shop-data', () => {
  it('finds items by id and returns undefined for unknown ids', () => {
    expect(findShopItem('protein')).toBe(SHOP_ITEMS[1])
    expect(findShopItem('nope')).toBeUndefined()
  })
})

describe('ShopService', () => {
  const setup = () => {
    const etm = makeEtm()
    const inventoryService = {
      add: jest.fn(),
      getInventory: jest.fn().mockResolvedValue({ items: [{ itemId: 'protein', quantity: 1 }] }),
    }
    const walletService = { change: jest.fn().mockResolvedValue({ coin: 5 }) }
    const service = new ShopService(
      makeDataSource(etm) as never,
      inventoryService as never,
      walletService as never
    )
    return { inventoryService, walletService, service }
  }

  it('lists the catalog', () => {
    expect(setup().service.getItems()).toEqual({ items: SHOP_ITEMS })
  })

  it('rejects an unknown item before touching the wallet', async () => {
    const { service, walletService } = setup()
    await expect(service.buy(USER, 'nope')).rejects.toThrow(new NotFoundException('Item not found'))
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('charges the price and fills the bag', async () => {
    const { service, walletService, inventoryService } = setup()
    const result = await service.buy(USER, EnumShopItemId.PROTEIN)
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -15,
      EnumWalletTransactionReason.SHOP_PURCHASE,
      'protein',
      expect.anything()
    )
    expect(inventoryService.add).toHaveBeenCalledWith(USER, 'protein', expect.anything())
    expect(result).toEqual({ wallet: { coin: 5 }, items: [{ itemId: 'protein', quantity: 1 }] })
  })
})

describe('ShopController', () => {
  const user = { 'user-id': USER } as never
  const shop = {
    getItems: jest.fn().mockReturnValue({ items: [] }),
    buy: jest.fn().mockResolvedValue('bought'),
  }
  const equipment = {
    buyBox: jest.fn().mockResolvedValue('box'),
    buyMaterial: jest.fn().mockResolvedValue('material'),
  }
  const controller = new ShopController(shop as never, equipment as never)

  it('delegates every route with the caller id', async () => {
    expect(controller.getItems()).toEqual({ items: [] })
    expect(await controller.buy({ itemId: 'protein' } as never, user)).toBe('bought')
    expect(shop.buy).toHaveBeenCalledWith(USER, 'protein')
    expect(await controller.buyBox(user)).toBe('box')
    expect(equipment.buyBox).toHaveBeenCalledWith(USER)
    expect(await controller.buyMaterial({ itemId: 'enhance_stone' } as never, user)).toBe(
      'material'
    )
    expect(equipment.buyMaterial).toHaveBeenCalledWith(USER, 'enhance_stone')
  })
})
