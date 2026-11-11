import { BadRequestException, NotFoundException } from '@nestjs/common'
import { IsNull, Not } from 'typeorm'
import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
  MonsterEntity,
} from '../../../db/entities/monster.entity'
import { MonsterDexEntity } from '../../../db/entities/monster-dex.entity'
import { EnumMonsterLogType, MonsterLogEntity } from '../../../db/entities/monster-log.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { MAX_LIVING_MONSTERS, RARE_EGG_RAID_TOKEN_PRICE } from './monster-rules'
import { SPIRITUAL_LINES } from './species-data'
import { RENAME_COOLDOWN_MS } from './monster-name'
import * as view from './monster-view'
import { SELECTED_ORDER } from './monster-view'
import * as serviceModule from './monster.service'
import { NOW, pet } from './core-test-helpers'
import { mocks, setup } from './monster-service-test-helpers'

jest.mock('../passive/passive.service', () => ({ loadPassiveBonus: jest.fn() }))
jest.mock('./special-bonus', () => ({ loadSpecialBonus: jest.fn() }))
jest.mock('../adventure/quest.service', () => ({ recordQuestProgress: jest.fn() }))
jest.mock('../inventory/inventory-bag', () => ({ addToBag: jest.fn() }))

afterEach(() => jest.useRealTimers())

it('re-exports the view helpers other modules import from the service', () => {
  expect(serviceModule.releaseGear).toBe(view.releaseGear)
  expect(serviceModule.toMonsterView).toBe(view.toMonsterView)
  expect(serviceModule.withRuleErrors).toBe(view.withRuleErrors)
})

describe('MonsterService reads and simple writes', () => {
  describe('getMyMonster', () => {
    it('returns the selected pet and every living one in birth order', async () => {
      const { etm, service } = setup()
      const young = pet({ id: 'young', bornAt: new Date(NOW.getTime() + 1000), selectedAt: NOW })
      const old = pet({ id: 'old', bornAt: NOW, selectedAt: null })
      etm.find.mockResolvedValue([young, old])
      const result = await service.getMyMonster('user-1')
      expect(result.monster?.id).toBe('young')
      expect(result.monsters.map(m => m.id)).toEqual(['old', 'young'])
      expect(result.maxMonsters).toBe(MAX_LIVING_MONSTERS)
      expect(etm.find).toHaveBeenCalledWith(MonsterEntity, {
        where: { ownerId: 'user-1', diedAt: IsNull(), isListed: false },
        order: SELECTED_ORDER,
        lock: { mode: 'pessimistic_write' },
      })
    })

    it('shows the most recent dead pet as selected when none lives', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([])
      etm.findOne.mockResolvedValue(pet({ id: 'dead', diedAt: NOW }))
      const result = await service.getMyMonster('user-1')
      expect(result.monster?.id).toBe('dead')
      expect(result.monsters).toEqual([])
      expect(etm.findOne).toHaveBeenCalledWith(MonsterEntity, {
        where: { ownerId: 'user-1', isListed: false },
        order: { bornAt: 'DESC' },
      })
    })

    it('returns null when the player never had a pet', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([])
      etm.findOne.mockResolvedValue(null)
      const result = await service.getMyMonster('user-1')
      expect(result.monster).toBeNull()
    })
  })

  describe('lockAndTickLiving', () => {
    it('stamps lastSeenAt and applies the passive and gear drain multipliers', async () => {
      const { etm, service } = setup()
      mocks.passive.mockResolvedValue({ hungerDrainMultiplier: 0.5 })
      mocks.special.mockResolvedValue({ hungerDrainMultiplier: 0.5, poopRateMultiplier: 2 })
      etm.find.mockResolvedValue([pet()])
      const living = await service.lockAndTickLiving('user-1', NOW, etm)
      expect(living).toHaveLength(1)
      expect(living[0].lastSeenAt).toEqual(NOW)
      expect(mocks.passive).toHaveBeenCalledWith('user-1', etm)
      expect(mocks.special).toHaveBeenCalledWith('pet-1', etm)
    })

    it('drops pets that died while away and releases their gear', async () => {
      const { etm, service } = setup()
      // Starved: hungry for far longer than the death threshold.
      etm.find.mockResolvedValue([
        pet({
          fullness: 0,
          hungryMinutes: 100_000,
          lastTickAt: new Date(NOW.getTime() - 60 * 60_000),
          lastSeenAt: null,
        }),
      ])
      const living = await service.lockAndTickLiving('user-1', NOW, etm)
      expect(living).toEqual([])
      expect(etm.update).toHaveBeenCalled()
      expect(etm.save).toHaveBeenCalledWith(
        MonsterLogEntity,
        expect.arrayContaining([expect.objectContaining({ type: EnumMonsterLogType.DEATH })])
      )
    })
  })

  describe('hatch', () => {
    it('creates an egg, logs the hatch and returns the view', async () => {
      const { etm, service, wallet } = setup()
      etm.find.mockResolvedValue([])
      const result = await service.hatch('user-1', EnumMonsterLine.FLAME)
      expect(result.monster.stage).toBe(EnumMonsterStage.EGG)
      expect(etm.save).toHaveBeenCalledWith(
        MonsterEntity,
        expect.objectContaining({ ownerId: 'user-1', selectedAt: NOW })
      )
      expect(etm.save).toHaveBeenCalledWith(MonsterLogEntity, [
        expect.objectContaining({ type: EnumMonsterLogType.HATCH }),
      ])
      expect(wallet.change).not.toHaveBeenCalled()
    })

    it('rejects when the slots are full', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue(
        Array.from({ length: MAX_LIVING_MONSTERS }, (_, i) => pet({ id: `p${i}` }))
      )
      await expect(service.hatch('user-1', EnumMonsterLine.FLAME)).rejects.toThrow(
        new BadRequestException(`You can raise at most ${MAX_LIVING_MONSTERS} monsters`)
      )
    })

    it('charges Raid Tokens for a rare egg in the same transaction', async () => {
      const { etm, service, wallet } = setup()
      etm.find.mockResolvedValue([])
      const line = SPIRITUAL_LINES[0]
      await service.hatch('user-1', line)
      expect(wallet.change).toHaveBeenCalledWith(
        'user-1',
        EnumWalletCurrency.RAID_TOKEN,
        -RARE_EGG_RAID_TOKEN_PRICE,
        EnumWalletTransactionReason.RARE_EGG,
        line,
        etm
      )
    })
  })

  describe('rename', () => {
    it('saves the cleaned nickname and the rename time', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([pet()])
      const result = await service.rename('user-1', 'pet-1', '  Momo  ')
      expect(result.monster.nickname).toBe('Momo')
      expect(result.monster.lastRenamedAt).toEqual(NOW)
    })

    it('clears the nickname for empty input', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([pet({ nickname: 'Old' })])
      const result = await service.rename('user-1', 'pet-1', '   ')
      expect(result.monster.nickname).toBeNull()
    })

    it('404s for a pet that is not living', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([pet()])
      await expect(service.rename('user-1', 'other', 'Momo')).rejects.toThrow(
        new NotFoundException('Monster not found')
      )
    })

    it('turns a bad name into a 400 with the rule message', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([pet()])
      await expect(service.rename('user-1', 'pet-1', 'bad<name>')).rejects.toThrow(
        new BadRequestException('Pet name has characters that are not allowed')
      )
    })

    it('enforces the cooldown but allows it once elapsed', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([pet({ lastRenamedAt: new Date(NOW.getTime() - 1000) })])
      await expect(service.rename('user-1', 'pet-1', 'Momo')).rejects.toThrow(
        new BadRequestException('Pet was renamed recently')
      )
      etm.find.mockResolvedValue([
        pet({ lastRenamedAt: new Date(NOW.getTime() - RENAME_COOLDOWN_MS) }),
      ])
      await expect(service.rename('user-1', 'pet-1', 'Momo')).resolves.toBeDefined()
    })
  })

  describe('select', () => {
    it('marks the pet as selected now', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([pet({ selectedAt: null })])
      const result = await service.select('user-1', 'pet-1')
      expect(result.monster.selectedAt).toEqual(NOW)
    })

    it('404s for an unknown pet', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([])
      await expect(service.select('user-1', 'x')).rejects.toThrow(NotFoundException)
    })
  })

  describe('getEvolutionPath', () => {
    it('reads the evolve logs of an owned pet', async () => {
      const { repo, dataSource, service } = setup()
      const logRepo = {
        find: jest.fn().mockResolvedValue([{ payload: { from: 'flame_egg', to: 'flame_baby1' } }]),
      }
      dataSource.getRepository.mockReturnValue(logRepo)
      repo.findOne.mockResolvedValue(pet({ speciesId: 'flame_baby1' }))
      await expect(service.getEvolutionPath('user-1', 'pet-1')).resolves.toEqual({
        monsterId: 'pet-1',
        path: ['flame_egg', 'flame_baby1'],
      })
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'pet-1', ownerId: 'user-1' } })
      expect(dataSource.getRepository).toHaveBeenCalledWith(MonsterLogEntity)
      expect(logRepo.find).toHaveBeenCalledWith({
        where: { monsterId: 'pet-1', type: EnumMonsterLogType.EVOLVE },
      })
    })

    it('404s when the pet is not the caller’s', async () => {
      const { repo, service } = setup()
      repo.findOne.mockResolvedValue(null)
      await expect(service.getEvolutionPath('user-1', 'pet-9')).rejects.toThrow(
        new NotFoundException('Monster not found')
      )
    })
  })

  describe('history, dex and read-only loaders', () => {
    it('lists dead pets, newest first, capped at 50', async () => {
      const { repo, service } = setup()
      repo.find.mockResolvedValue([
        pet({ diedAt: NOW, deathCause: EnumMonsterDeathCause.STARVATION }),
      ])
      const result = await service.getHistory('user-1')
      expect(result.monsters).toHaveLength(1)
      expect(repo.find).toHaveBeenCalledWith({
        where: { ownerId: 'user-1', diedAt: Not(IsNull()) },
        order: { diedAt: 'DESC' },
        take: 50,
      })
    })

    it('marks discovered species in the dex', async () => {
      const { dataSource, service } = setup()
      const dexRepo = { find: jest.fn().mockResolvedValue([{ speciesId: 'flame_baby1' }]) }
      dataSource.getRepository.mockReturnValue(dexRepo)
      const { species } = await service.getDex('user-1')
      expect(dataSource.getRepository).toHaveBeenCalledWith(MonsterDexEntity)
      expect(species.find(entry => entry.id === 'flame_baby1')?.discovered).toBe(true)
      expect(species.filter(entry => entry.discovered)).toHaveLength(1)
    })

    it('getLiving reads without locking', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([pet()])
      await service.getLiving('user-1', etm)
      expect(etm.find).toHaveBeenCalledWith(MonsterEntity, {
        where: { ownerId: 'user-1', diedAt: IsNull(), isListed: false },
        order: SELECTED_ORDER,
      })
    })

    it('getLatestAlive hides an egg and a missing pet', async () => {
      const { etm, service } = setup()
      etm.findOne.mockResolvedValueOnce(pet({ stage: EnumMonsterStage.EGG }))
      await expect(service.getLatestAlive('user-1', etm)).resolves.toBeNull()
      etm.findOne.mockResolvedValueOnce(null)
      await expect(service.getLatestAlive('user-1', etm)).resolves.toBeNull()
      const hatched = pet()
      etm.findOne.mockResolvedValueOnce(hatched)
      await expect(service.getLatestAlive('user-1', etm)).resolves.toBe(hatched)
    })
  })
})
