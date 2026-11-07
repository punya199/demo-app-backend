/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- rtk jest mock call inspection */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import { EnumShopItemId } from '../equipment/shop-data'
import { monster, NOW } from '../core/monster-engine/test-fixtures'
import { addToBag } from './inventory-bag'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'

const user = { 'user-id': 'user-1' } as never

describe('addToBag', () => {
  it('runs one atomic upsert with the quantity as a parameter', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    await addToBag({ query } as never, 'u1', 'item-a')
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT')
    expect(query.mock.calls[0][1]).toEqual(['u1', 'item-a', 1])
  })

  it('passes an explicit quantity', async () => {
    const query = jest.fn()
    await addToBag({ query } as never, 'u1', 'item-a', 5)
    expect(query.mock.calls[0][1]).toEqual(['u1', 'item-a', 5])
  })
})

describe('InventoryController', () => {
  it('delegates to the service with the JWT user id', async () => {
    const service = {
      getInventory: jest.fn().mockResolvedValue({ items: [] }),
      use: jest.fn().mockResolvedValue({ ok: true }),
    }
    const controller = new InventoryController(service as unknown as InventoryService)
    await expect(controller.getInventory(user)).resolves.toEqual({ items: [] })
    expect(service.getInventory).toHaveBeenCalledWith('user-1')
    await expect(
      controller.use({ itemId: EnumShopItemId.PROTEIN } as never, user)
    ).resolves.toEqual({
      ok: true,
    })
    expect(service.use).toHaveBeenCalledWith('user-1', EnumShopItemId.PROTEIN)
  })
})

describe('InventoryService', () => {
  const setup = () => {
    const etm = {
      find: jest.fn(),
      query: jest.fn(),
      execute: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
      where: jest.fn(),
      createQueryBuilder: jest.fn(),
    }
    // chainable update builder
    etm.createQueryBuilder.mockReturnValue(etm)
    etm.update.mockReturnValue(etm)
    etm.set.mockReturnValue(etm)
    etm.where.mockReturnValue(etm)
    const dataSource = {
      manager: etm,
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(etm)),
    }
    const monsters = {
      lockAndTickLatest: jest.fn(),
      saveState: jest.fn(),
      saveEvents: jest.fn(),
    }
    const service = new InventoryService(dataSource as never, monsters as never)
    return { etm, dataSource, monsters, service }
  }

  it('getInventory hides empty stacks and uses the default manager', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 0 },
    ])
    await expect(service.getInventory('u1')).resolves.toEqual({
      items: [{ itemId: 'a', quantity: 2 }],
    })
  })

  it('add upserts through the given manager', async () => {
    const { etm, service } = setup()
    await service.add('u1', 'item-a', etm as never, 3)
    expect(etm.query.mock.calls[0][1]).toEqual(['u1', 'item-a', 3])
    await service.add('u1', 'item-a', etm as never)
    expect(etm.query.mock.calls[1][1]).toEqual(['u1', 'item-a', 1])
  })

  it('spend returns true when a row was updated and false otherwise', async () => {
    const { etm, service } = setup()
    etm.execute.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 })
    await expect(service.spend('u1', 'i', 1, etm as never)).resolves.toBe(true)
    const set = etm.set.mock.calls[0][0] as { quantity: () => string }
    expect(set.quantity()).toBe('quantity - 1')
    expect(etm.where.mock.calls[0][1]).toEqual({ userId: 'u1', itemId: 'i', quantity: 1 })
    await expect(service.spend('u1', 'i', 1, etm as never)).resolves.toBe(false)
  })

  describe('use', () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(NOW))
    afterEach(() => jest.useRealTimers())

    it('rejects when the player has no monster', async () => {
      const { monsters, service } = setup()
      monsters.lockAndTickLatest.mockResolvedValue(null)
      await expect(service.use('u1', EnumShopItemId.PROTEIN)).rejects.toThrow(
        new NotFoundException('You do not have a monster yet')
      )
    })

    it('rejects when the item is not in the bag, saving nothing', async () => {
      const { etm, monsters, service } = setup()
      monsters.lockAndTickLatest.mockResolvedValue(monster({ fullness: 1 }))
      etm.execute.mockResolvedValue({ affected: 0 })
      await expect(service.use('u1', EnumShopItemId.PROTEIN)).rejects.toThrow(
        new BadRequestException('You do not have this item')
      )
      expect(monsters.saveState).not.toHaveBeenCalled()
    })

    it('applies the item, saves state and events, and returns the bag', async () => {
      const { etm, monsters, service } = setup()
      const current = monster({ fullness: 1, stage: EnumMonsterStage.ADULT })
      monsters.lockAndTickLatest.mockResolvedValue(current)
      etm.execute.mockResolvedValue({ affected: 1 })
      etm.find.mockResolvedValue([{ itemId: 'x', quantity: 1 }])
      monsters.saveState.mockImplementation(async (_m: unknown, state: object) => ({
        ...current,
        ...state,
      }))
      const out = await service.use('u1', EnumShopItemId.PROTEIN)
      expect(monsters.lockAndTickLatest).toHaveBeenCalledWith('u1', NOW, etm)
      expect(monsters.saveState).toHaveBeenCalledWith(current, expect.any(Object), etm)
      expect(monsters.saveEvents).toHaveBeenCalledWith(expect.any(Object), expect.any(Array), etm)
      expect(out.items).toEqual([{ itemId: 'x', quantity: 1 }])
      expect(out.monster).toBeDefined()
    })
  })
})
