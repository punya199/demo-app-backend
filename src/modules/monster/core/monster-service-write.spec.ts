import { BadRequestException, NotFoundException } from '@nestjs/common'
import {
  EnumMonsterDeathCause,
  EnumMonsterStage,
  MonsterEntity,
} from '../../../db/entities/monster.entity'
import { MonsterDexEntity } from '../../../db/entities/monster-dex.entity'
import { EnumMonsterLogType, MonsterLogEntity } from '../../../db/entities/monster-log.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { EnumMonsterAction } from './monster-engine'
import {
  DEX_DISCOVERY_GEM_REWARD,
  MAX_STAMINA,
  MERGE_COIN_COST,
  MERGE_GEM_COST,
  STAMINA_REFILL_GEM_PRICE,
} from './monster-rules'
import { petCoreItemId } from './pet-core'
import { fakeInsertBuilder, NOW, pet } from './core-test-helpers'
import { mocks, setup } from './monster-service-test-helpers'

jest.mock('../passive/passive.service', () => ({ loadPassiveBonus: jest.fn() }))
jest.mock('./special-bonus', () => ({ loadSpecialBonus: jest.fn() }))
jest.mock('../adventure/quest.service', () => ({ recordQuestProgress: jest.fn() }))
jest.mock('../inventory/inventory-bag', () => ({ addToBag: jest.fn() }))

afterEach(() => jest.useRealTimers())

const ultimate = (id: string, line = 'flame', over: Record<string, unknown> = {}) =>
  pet({
    id,
    speciesId: `${line}_ultimate`,
    line,
    stage: EnumMonsterStage.ULTIMATE,
    nickname: `${id}-name`,
    ...over,
  })

describe('MonsterService merge', () => {
  it('rejects the same monster twice and a base outside the pair, before any work', async () => {
    const { service, dataSource } = setup()
    await expect(service.merge('user-1', 'a', 'a', 'a')).rejects.toThrow(
      new BadRequestException('Pick two different monsters')
    )
    await expect(service.merge('user-1', 'a', 'b', 'c')).rejects.toThrow(
      new BadRequestException('The base must be one of the two monsters')
    )
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  it('404s when a parent is not a living pet of the caller', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([ultimate('a')])
    await expect(service.merge('user-1', 'a', 'b', 'a')).rejects.toThrow(
      new NotFoundException('Monster not found')
    )
  })

  it('surfaces a broken merge rule as a 400 and charges nothing', async () => {
    const { etm, service, wallet } = setup()
    etm.find.mockResolvedValue([ultimate('a'), ultimate('b', 'flame', { isSick: true })])
    await expect(service.merge('user-1', 'a', 'b', 'a')).rejects.toThrow(
      new BadRequestException('Monster is sick')
    )
    expect(wallet.change).not.toHaveBeenCalled()
  })

  it.each([
    ['first', 'a'],
    ['second', 'b'],
  ])('fuses into a pet named after the %s parent when it is the base', async (_label, baseId) => {
    const { etm, service, wallet } = setup()
    etm.find.mockResolvedValue([ultimate('a', 'flame'), ultimate('b', 'tide')])
    const result = await service.merge('user-1', 'a', 'b', baseId)

    expect(result.monster.stage).toBe(EnumMonsterStage.FUSED)
    expect(result.monster.nickname).toBe(`${baseId}-name`)
    expect(result.wallet).toEqual({ gem: 1 })
    expect(wallet.change).toHaveBeenNthCalledWith(
      1,
      'user-1',
      EnumWalletCurrency.COIN,
      -MERGE_COIN_COST,
      EnumWalletTransactionReason.MONSTER_MERGE,
      null,
      etm
    )
    expect(wallet.change).toHaveBeenNthCalledWith(
      2,
      'user-1',
      EnumWalletCurrency.GEM,
      -MERGE_GEM_COST,
      EnumWalletTransactionReason.MONSTER_MERGE,
      null,
      etm
    )
    type Log = { type: EnumMonsterLogType; monsterId: string; payload: { cause: string } }
    const logs = etm.save.mock.calls
      .filter(([entity]) => entity === MonsterLogEntity)
      .map(([, value]) => value as Log | Log[])
    const merged = logs.filter((log): log is Log => !Array.isArray(log))
    expect(merged.map(log => log.monsterId).sort()).toEqual(['a', 'b'])
    expect(merged.every(log => log.type === EnumMonsterLogType.DEATH)).toBe(true)
    expect(merged[0].payload.cause).toBe(EnumMonsterDeathCause.MERGED)
    expect(etm.update).toHaveBeenCalledTimes(2)
    const fuse = logs.find((log): log is Log[] => Array.isArray(log))
    expect(fuse?.[0].type).toBe(EnumMonsterLogType.FUSE)
  })
})

describe('MonsterService returnHome', () => {
  it('404s for an unknown pet', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([])
    await expect(service.returnHome('user-1', 'a')).rejects.toThrow(NotFoundException)
  })

  it('rejects a pet that is too young', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([pet()])
    await expect(service.returnHome('user-1', 'pet-1')).rejects.toThrow(
      new BadRequestException('Only a monster in its perfect form or beyond can return home')
    )
    expect(mocks.bag).not.toHaveBeenCalled()
  })

  it('pays a Pet Core, retires the pet and returns its gear', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([ultimate('a')])
    const result = await service.returnHome('user-1', 'a')
    const coreId = petCoreItemId('flame_ultimate')
    expect(result).toEqual({ itemId: coreId, quantity: 1 })
    expect(mocks.bag).toHaveBeenCalledWith(etm, 'user-1', coreId, 1)
    expect(etm.save).toHaveBeenCalledWith(
      MonsterEntity,
      expect.objectContaining({
        diedAt: NOW,
        deathCause: EnumMonsterDeathCause.RETURNED,
        selectedAt: null,
      })
    )
    expect(etm.update).toHaveBeenCalledTimes(1)
    expect(etm.save).toHaveBeenCalledWith(
      MonsterLogEntity,
      expect.objectContaining({
        monsterId: 'a',
        payload: {
          cause: EnumMonsterDeathCause.RETURNED,
          core: coreId,
          at: NOW.toISOString(),
        },
      })
    )
  })
})

describe('MonsterService actions', () => {
  it('feeds the selected pet when no id is given', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([pet({ fullness: 1 })])
    const result = await service.act('user-1', EnumMonsterAction.FEED)
    expect(result.monster.fullness).toBe(2)
    expect(etm.save).toHaveBeenCalledWith(MonsterLogEntity, [
      expect.objectContaining({ type: EnumMonsterLogType.ACTION }),
    ])
  })

  it('targets a given pet, and 404s when it is not living', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([pet({ fullness: 1 })])
    await expect(service.act('user-1', EnumMonsterAction.FEED, 'pet-1')).resolves.toBeDefined()
    await expect(service.act('user-1', EnumMonsterAction.FEED, 'zzz')).rejects.toThrow(
      new NotFoundException('You do not have a monster yet')
    )
  })

  it('404s when the player has no pet at all', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([])
    etm.findOne.mockResolvedValue(null)
    await expect(service.act('user-1', EnumMonsterAction.FEED)).rejects.toThrow(NotFoundException)
  })

  it('maps a rule error to a 400', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([pet({ stage: EnumMonsterStage.EGG })])
    await expect(service.act('user-1', EnumMonsterAction.FEED)).rejects.toThrow(BadRequestException)
  })

  it('plays the mini-game and reports the stamina reward', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([pet({ stamina: 0 })])
    const result = await service.playMinigame('user-1', 3, 'pet-1')
    expect(result.reward).toBe(result.monster.stamina)
    expect(result.reward).toBeGreaterThanOrEqual(0)
  })

  it('404s for the mini-game and refill when the target pet is not living', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([pet()])
    await expect(service.playMinigame('user-1', 3, 'zzz')).rejects.toThrow(
      new NotFoundException('You do not have a monster yet')
    )
    await expect(service.refillStamina('user-1', 'zzz')).rejects.toThrow(NotFoundException)
  })

  it('rejects an invalid mini-game score', async () => {
    const { etm, service } = setup()
    etm.find.mockResolvedValue([pet()])
    await expect(service.playMinigame('user-1', 9999)).rejects.toThrow(
      new BadRequestException('Invalid mini-game score')
    )
  })

  describe('refillStamina', () => {
    it('charges gems then fills stamina', async () => {
      const { etm, service, wallet } = setup()
      etm.find.mockResolvedValue([pet({ stamina: 0 })])
      const result = await service.refillStamina('user-1')
      expect(result.monster.stamina).toBe(MAX_STAMINA)
      expect(result.wallet).toEqual({ gem: 1 })
      expect(wallet.change).toHaveBeenCalledWith(
        'user-1',
        EnumWalletCurrency.GEM,
        -STAMINA_REFILL_GEM_PRICE,
        EnumWalletTransactionReason.STAMINA_REFILL,
        'pet-1',
        etm
      )
    })

    it('does not charge when stamina is already full', async () => {
      const { etm, service, wallet } = setup()
      etm.find.mockResolvedValue([pet({ stamina: MAX_STAMINA })])
      await expect(service.refillStamina('user-1', 'pet-1')).rejects.toThrow(
        new BadRequestException('Stamina is already full')
      )
      expect(wallet.change).not.toHaveBeenCalled()
    })
  })
})

describe('MonsterService saveState / saveEvents', () => {
  it('releases gear only on the save that kills the pet', async () => {
    const { etm, service } = setup()
    const alive = pet()
    const state = { ...(alive as object), diedAt: NOW } as never
    await service.saveState(alive, state, etm)
    expect(etm.update).toHaveBeenCalledTimes(1)
    // Already dead: saving again must not release again.
    await service.saveState(alive, state, etm)
    expect(etm.update).toHaveBeenCalledTimes(1)
    // Alive and staying alive.
    const other = pet({ id: 'other' })
    await service.saveState(other, { ...(other as object) } as never, etm)
    expect(etm.update).toHaveBeenCalledTimes(1)
  })

  it('writes nothing for no events', async () => {
    const { etm, service } = setup()
    await service.saveEvents(pet(), [], etm)
    expect(etm.save).not.toHaveBeenCalled()
    expect(mocks.quests).not.toHaveBeenCalled()
  })

  it('logs events and records quest progress without touching the dex for plain actions', async () => {
    const { etm, service } = setup()
    const event = { type: EnumMonsterLogType.ACTION, at: NOW, payload: { action: 'feed' } }
    await service.saveEvents(pet(), [event], etm)
    expect(etm.save).toHaveBeenCalledWith(MonsterLogEntity, [
      {
        monsterId: 'pet-1',
        type: EnumMonsterLogType.ACTION,
        payload: { action: 'feed', at: NOW.toISOString() },
      },
    ])
    expect(mocks.quests).toHaveBeenCalledWith('user-1', NOW, [event], etm)
    expect(etm.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('records new dex species and pays the discovery reward once per new species', async () => {
    const { etm, service, wallet } = setup()
    const builder = fakeInsertBuilder({ raw: [{ species_id: 'a' }, { species_id: 'b' }] })
    etm.createQueryBuilder.mockReturnValue(builder)
    const events = [
      { type: EnumMonsterLogType.EVOLVE, at: NOW, payload: { to: 'a' } },
      { type: EnumMonsterLogType.FUSE, at: NOW, payload: { to: 'b' } },
    ]
    await service.saveEvents(pet(), events, etm)
    expect(builder.into).toHaveBeenCalledWith(MonsterDexEntity)
    expect(builder.values).toHaveBeenCalledWith([
      { userId: 'user-1', speciesId: 'a', firstSeenAt: NOW },
      { userId: 'user-1', speciesId: 'b', firstSeenAt: NOW },
    ])
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.GEM,
      2 * DEX_DISCOVERY_GEM_REWARD,
      EnumWalletTransactionReason.DEX_DISCOVERY,
      'a,b',
      etm
    )
  })

  it('pays nothing when every species was already known', async () => {
    const { etm, service, wallet } = setup()
    etm.createQueryBuilder.mockReturnValue(fakeInsertBuilder({ raw: [] }))
    await service.saveEvents(
      pet(),
      [{ type: EnumMonsterLogType.EVOLVE, at: NOW, payload: { to: 'a' } }],
      etm
    )
    expect(wallet.change).not.toHaveBeenCalled()
  })
})
