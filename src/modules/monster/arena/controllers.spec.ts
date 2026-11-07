import { MODULE_METADATA } from '@nestjs/common/constants'
import { DummyController } from './dummy.controller'
import { DummyService } from './dummy.service'
import { MonsterArenaModule } from './arena.module'
import { PvpController } from './pvp.controller'
import { PvpService } from './pvp.service'

const USER = { 'user-id': 'user-1' } as never

describe('PvpController', () => {
  const service = {
    getStatus: jest.fn().mockResolvedValue('status'),
    setDefense: jest.fn().mockResolvedValue('defense'),
    getOpponents: jest.fn().mockResolvedValue('opponents'),
    battle: jest.fn().mockResolvedValue('battle'),
    getHistory: jest.fn().mockResolvedValue('history'),
    getReplay: jest.fn().mockResolvedValue('replay'),
    getLeaderboard: jest.fn().mockResolvedValue('leaderboard'),
    claimSeason: jest.fn().mockResolvedValue('claim'),
  }
  const controller = new PvpController(service as unknown as PvpService)

  it('forwards each route to the service with the caller id', async () => {
    await expect(controller.getStatus(USER)).resolves.toBe('status')
    await expect(controller.setDefense({ displayName: 'Hero' }, USER)).resolves.toBe('defense')
    await expect(controller.getOpponents(USER)).resolves.toBe('opponents')
    await expect(controller.getHistory(USER)).resolves.toBe('history')
    await expect(controller.getReplay('b1', USER)).resolves.toBe('replay')
    await expect(controller.getLeaderboard({ season: '2026-W02' }, USER)).resolves.toBe(
      'leaderboard'
    )
    await expect(controller.claimSeason({ season: '2026-W02' }, USER)).resolves.toBe('claim')
    expect(service.getStatus).toHaveBeenCalledWith('user-1')
    expect(service.setDefense).toHaveBeenCalledWith('user-1', 'Hero')
    expect(service.getOpponents).toHaveBeenCalledWith('user-1')
    expect(service.getHistory).toHaveBeenCalledWith('user-1')
    expect(service.getReplay).toHaveBeenCalledWith('user-1', 'b1')
    expect(service.getLeaderboard).toHaveBeenCalledWith('user-1', '2026-W02')
    expect(service.claimSeason).toHaveBeenCalledWith('user-1', '2026-W02')
  })
})

describe('DummyController', () => {
  const service = {
    getPresets: jest.fn().mockReturnValue('presets'),
    fight: jest.fn().mockResolvedValue('fight'),
  }
  const controller = new DummyController(service as unknown as DummyService)

  it('forwards presets and fights', async () => {
    expect(controller.getPresets()).toBe('presets')
    const body = { preset: 'plain' } as never
    await expect(controller.fight(body, USER)).resolves.toBe('fight')
    expect(service.fight).toHaveBeenCalledWith('user-1', body)
  })
})

describe('MonsterArenaModule', () => {
  it('registers both controllers and services', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MonsterArenaModule)).toEqual([
      PvpController,
      DummyController,
    ])
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MonsterArenaModule)).toEqual([
      PvpService,
      DummyService,
    ])
  })
})
