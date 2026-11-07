import { MODULE_METADATA } from '@nestjs/common/constants'
import { MonsterBossModule } from './boss.module'
import { RaidController } from './raid.controller'
import { RaidService } from './raid.service'
import { WorldBossController } from './world-boss.controller'
import { WorldBossService } from './world-boss.service'

const user = { 'user-id': 'user-1' } as never

describe('RaidController', () => {
  const service = {
    getRaid: jest.fn().mockResolvedValue('raid'),
    battle: jest.fn().mockResolvedValue('battle'),
    exchange: jest.fn().mockResolvedValue('exchange'),
  }
  const controller = new RaidController(service as unknown as RaidService)

  it('passes the user id and body fields to the service', async () => {
    await expect(controller.getRaid(user)).resolves.toBe('raid')
    expect(service.getRaid).toHaveBeenCalledWith('user-1')
    await expect(
      controller.battle({ bossId: 'b', difficulty: 'easy' } as never, user)
    ).resolves.toBe('battle')
    expect(service.battle).toHaveBeenCalledWith('user-1', 'b', 'easy')
    const body = { bossId: 'b', slot: 'weapon', grade: 'rare' } as never
    await expect(controller.exchange(body, user)).resolves.toBe('exchange')
    expect(service.exchange).toHaveBeenCalledWith('user-1', 'b', 'weapon', 'rare')
  })
})

describe('WorldBossController', () => {
  const service = {
    getStatus: jest.fn().mockResolvedValue('status'),
    attack: jest.fn().mockResolvedValue('attack'),
    getRanking: jest.fn().mockResolvedValue('ranking'),
    claim: jest.fn().mockResolvedValue('claim'),
    exchange: jest.fn().mockResolvedValue('exchange'),
  }
  const controller = new WorldBossController(service as unknown as WorldBossService)

  it('passes the user id and request fields to the service', async () => {
    await expect(controller.getStatus(user)).resolves.toBe('status')
    expect(service.getStatus).toHaveBeenCalledWith('user-1')
    await expect(controller.attack({ supportId: 'u' } as never, user)).resolves.toBe('attack')
    expect(service.attack).toHaveBeenCalledWith('user-1', 'u')
    await expect(controller.getRanking({ week: '2026-W01' } as never, user)).resolves.toBe(
      'ranking'
    )
    expect(service.getRanking).toHaveBeenCalledWith('user-1', '2026-W01')
    await expect(controller.claim({ week: '2026-W01' } as never, user)).resolves.toBe('claim')
    expect(service.claim).toHaveBeenCalledWith('user-1', '2026-W01')
    const body = { bossId: 'b', slot: 'weapon', grade: 'epic' } as never
    await expect(controller.exchange(body, user)).resolves.toBe('exchange')
    expect(service.exchange).toHaveBeenCalledWith('user-1', 'b', 'weapon', 'epic')
  })
})

describe('MonsterBossModule', () => {
  it('wires both controllers and services', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MonsterBossModule)).toEqual([
      RaidController,
      WorldBossController,
    ])
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MonsterBossModule)).toEqual([
      RaidService,
      WorldBossService,
    ])
  })
})
