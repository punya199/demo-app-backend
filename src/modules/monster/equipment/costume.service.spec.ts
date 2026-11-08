import { BadRequestException, NotFoundException } from '@nestjs/common'
import { MonsterEntity } from '../../../db/entities/monster.entity'
import { PlayerCostumeEntity } from '../../../db/entities/player-costume.entity'
import { PlayerProfileEntity } from '../../../db/entities/player-profile.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { COSTUMES, EnumCostumeSlot } from './costume-data'
import { CostumeController } from './costume.controller'
import { CostumeService, grantCostume, loadPublicCostumes } from './costume.service'
import {
  byEntity,
  makeDataSource,
  makeEtm,
  makeQb,
  PET_ID,
  petRow,
  USER,
} from './equipment-test-helpers'

// These specs cover the costume system switched on; costume-switch.spec.ts covers it switched off.
jest.mock('../core/monster-rules', () => ({
  ...jest.requireActual<Record<string, unknown>>('../core/monster-rules'),
  COSTUMES_ENABLED: true,
}))

const setup = () => {
  const etm = makeEtm()
  const monsterService = {
    getLiving: jest.fn().mockResolvedValue([petRow()]),
    lockAndTickLiving: jest.fn().mockResolvedValue([petRow()]),
  }
  const inventoryService = { spend: jest.fn().mockResolvedValue(true) }
  const walletService = { change: jest.fn() }
  const profileService = { ensureProfile: jest.fn() }
  const service = new CostumeService(
    makeDataSource(etm) as never,
    monsterService as never,
    inventoryService as never,
    walletService as never,
    profileService as never
  )
  // grantCostume uses the query builder: by default the insert really inserted a row.
  etm.createQueryBuilder.mockReturnValue(makeQb({ raw: [{ id: 'new' }] }))
  return { etm, monsterService, inventoryService, walletService, profileService, service }
}

describe('loadPublicCostumes', () => {
  it('returns an empty map without querying when there are no users', async () => {
    const etm = makeEtm()
    expect((await loadPublicCostumes([], etm as never)).size).toBe(0)
    expect(etm.query).not.toHaveBeenCalled()
  })

  it('keeps only shared, valid loadouts and de-duplicates the ids', async () => {
    const etm = makeEtm()
    etm.query.mockResolvedValue([
      { owner_id: 'u1', costume: { hat: 'cap', face: 'cap' }, show_costume: true },
      { owner_id: 'u2', costume: { hat: 'cap' }, show_costume: false },
    ])
    const result = await loadPublicCostumes(['u1', 'u2', 'u1'], etm as never)
    expect(etm.query).toHaveBeenCalledWith(expect.any(String), [['u1', 'u2']])
    expect([...result.entries()]).toEqual([['u1', { hat: 'cap' }]])
  })
})

describe('grantCostume', () => {
  it('is true for a fresh grant and false when the insert was ignored', async () => {
    const etm = makeEtm()
    const qb = makeQb({ raw: [{ id: 'x' }] })
    etm.createQueryBuilder.mockReturnValue(qb)
    expect(await grantCostume(USER, 'cap', etm as never)).toBe(true)
    expect(qb.into).toHaveBeenCalledWith(PlayerCostumeEntity)
    expect(qb.values).toHaveBeenCalledWith({ userId: USER, costumeId: 'cap' })
    etm.createQueryBuilder.mockReturnValue(makeQb({ raw: [] }))
    expect(await grantCostume(USER, 'cap', etm as never)).toBe(false)
  })
})

describe('CostumeService.getState', () => {
  it('lists free costumes as owned, plus bought ones, and defaults the privacy switch', async () => {
    const { service, etm, monsterService } = setup()
    etm.find.mockResolvedValue([{ costumeId: 'cap' }])
    monsterService.getLiving.mockResolvedValue([petRow({ costume: { hat: 'cap', face: 'bogus' } })])
    const state = await service.getState(USER)
    expect(state.catalog).toBe(COSTUMES)
    expect(state.owned).toEqual(expect.arrayContaining(['meadow', 'cap']))
    expect(state.owned).not.toContain('crown')
    expect(state.selectedId).toBe(PET_ID)
    expect(state.pets).toEqual([{ id: PET_ID, costume: { hat: 'cap' } }])
    expect(state.showCostume).toBe(true)
  })

  it('has no selected pet without pets and honours a stored privacy choice', async () => {
    const { service, etm, monsterService } = setup()
    monsterService.getLiving.mockResolvedValue([])
    etm.findOne.mockImplementation(
      byEntity(new Map([[PlayerProfileEntity, { showCostume: false }]]))
    )
    const state = await service.getState(USER, etm as never)
    expect(state.selectedId).toBeNull()
    expect(state.showCostume).toBe(false)
  })
})

describe('CostumeService.buy', () => {
  it('rejects an unknown costume', async () => {
    const { service } = setup()
    await expect(service.buy(USER, 'zzz')).rejects.toThrow(
      new NotFoundException('Costume not found')
    )
  })

  it('rejects a free costume and an already owned one', async () => {
    const { service, etm } = setup()
    await expect(service.buy(USER, 'meadow')).rejects.toThrow(
      new BadRequestException('You already own this costume')
    )
    etm.find.mockResolvedValue([{ costumeId: 'cap' }])
    await expect(service.buy(USER, 'cap')).rejects.toThrow(
      new BadRequestException('You already own this costume')
    )
  })

  it('rejects a season reward as not for sale', async () => {
    const { service, walletService } = setup()
    await expect(service.buy(USER, 'rainbow')).rejects.toThrow(
      new BadRequestException('This costume is a reward and cannot be bought')
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('pays a coin price from the wallet, grants it and returns the state', async () => {
    const { service, walletService } = setup()
    const state = await service.buy(USER, 'cap')
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.COIN,
      -150,
      EnumWalletTransactionReason.COSTUME_PURCHASE,
      'cap',
      expect.anything()
    )
    expect(state.catalog).toBe(COSTUMES)
  })

  it('pays a gem price in gems', async () => {
    const { service, walletService } = setup()
    await service.buy(USER, 'crown')
    expect(walletService.change).toHaveBeenCalledWith(
      USER,
      EnumWalletCurrency.GEM,
      -80,
      EnumWalletTransactionReason.COSTUME_PURCHASE,
      'crown',
      expect.anything()
    )
  })

  it('pays a boss costume with boss tokens instead of the wallet', async () => {
    const { service, walletService, inventoryService } = setup()
    await service.buy(USER, 'mask')
    expect(inventoryService.spend).toHaveBeenCalledWith(
      USER,
      'boss_token:deep_dweller',
      1,
      expect.anything()
    )
    expect(walletService.change).not.toHaveBeenCalled()
  })

  it('refuses a boss costume without enough tokens', async () => {
    const { service, inventoryService } = setup()
    inventoryService.spend.mockResolvedValue(false)
    await expect(service.buy(USER, 'mask')).rejects.toThrow(
      new BadRequestException('Not enough boss tokens')
    )
  })

  it('loses a race: the ignored insert aborts the purchase', async () => {
    const { service, etm } = setup()
    etm.createQueryBuilder.mockReturnValue(makeQb({ raw: [] }))
    await expect(service.buy(USER, 'cap')).rejects.toThrow(
      new BadRequestException('You already own this costume')
    )
  })
})

describe('CostumeService.equip / unequip / setShowCostume', () => {
  it('equip rejects an unknown costume and an unknown pet', async () => {
    const { service, monsterService } = setup()
    await expect(service.equip(USER, 'zzz')).rejects.toThrow(
      new NotFoundException('Costume not found')
    )
    monsterService.lockAndTickLiving.mockResolvedValue([])
    await expect(service.equip(USER, 'cap', PET_ID)).rejects.toThrow(
      new NotFoundException('Monster not found')
    )
  })

  it('equip rejects a costume the player does not own', async () => {
    const { service, etm } = setup()
    await expect(service.equip(USER, 'cap')).rejects.toThrow(
      new BadRequestException('You do not own this costume')
    )
    expect(etm.save).not.toHaveBeenCalled()
  })

  it('equip puts an owned costume into its slot and keeps the rest of the loadout', async () => {
    const { service, etm, monsterService } = setup()
    etm.find.mockResolvedValue([{ costumeId: 'cap' }])
    monsterService.lockAndTickLiving.mockResolvedValue([petRow({ costume: { face: 'glasses' } })])
    await service.equip(USER, 'cap', PET_ID)
    expect(etm.save).toHaveBeenCalledWith(
      MonsterEntity,
      expect.objectContaining({ costume: { hat: 'cap', face: 'glasses' } })
    )
  })

  it('equip wears a free costume without any purchase row', async () => {
    const { service, etm } = setup()
    await service.equip(USER, 'meadow')
    expect(etm.save).toHaveBeenCalledWith(
      MonsterEntity,
      expect.objectContaining({ costume: { backdrop: 'meadow' } })
    )
  })

  it('unequip rejects an unknown slot', async () => {
    const { service } = setup()
    await expect(service.unequip(USER, 'tail' as EnumCostumeSlot)).rejects.toThrow(
      new BadRequestException('Unknown costume slot')
    )
  })

  it('unequip clears just that slot', async () => {
    const { service, etm, monsterService } = setup()
    monsterService.lockAndTickLiving.mockResolvedValue([
      petRow({ costume: { hat: 'cap', face: 'glasses' } }),
    ])
    await service.unequip(USER, EnumCostumeSlot.HAT, PET_ID)
    expect(etm.save).toHaveBeenCalledWith(
      MonsterEntity,
      expect.objectContaining({ costume: { face: 'glasses' } })
    )
  })

  it('setShowCostume stores the switch on the profile', async () => {
    const { service, etm, profileService } = setup()
    const profile = { showCostume: true }
    profileService.ensureProfile.mockResolvedValue(profile)
    await service.setShowCostume(USER, false)
    expect(profile.showCostume).toBe(false)
    expect(etm.save).toHaveBeenCalledWith(PlayerProfileEntity, profile)
  })
})

describe('CostumeController', () => {
  it('delegates each route with the caller id', async () => {
    const svc = {
      getState: jest.fn().mockResolvedValue('state'),
      buy: jest.fn().mockResolvedValue('buy'),
      equip: jest.fn().mockResolvedValue('equip'),
      unequip: jest.fn().mockResolvedValue('unequip'),
      setShowCostume: jest.fn().mockResolvedValue('privacy'),
    }
    const controller = new CostumeController(svc as never)
    const user = { 'user-id': USER } as never
    expect(await controller.getState(user)).toBe('state')
    expect(await controller.buy({ costumeId: 'cap' } as never, user)).toBe('buy')
    expect(svc.buy).toHaveBeenCalledWith(USER, 'cap')
    expect(await controller.equip({ costumeId: 'cap', monsterId: PET_ID } as never, user)).toBe(
      'equip'
    )
    expect(svc.equip).toHaveBeenCalledWith(USER, 'cap', PET_ID)
    expect(await controller.unequip({ slot: 'hat', monsterId: PET_ID } as never, user)).toBe(
      'unequip'
    )
    expect(svc.unequip).toHaveBeenCalledWith(USER, 'hat', PET_ID)
    expect(await controller.setPrivacy({ show: false } as never, user)).toBe('privacy')
    expect(svc.setShowCostume).toHaveBeenCalledWith(USER, false)
  })
})
