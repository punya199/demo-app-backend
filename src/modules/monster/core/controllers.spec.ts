import { MonsterController } from './monster.controller'
import { MonsterService } from './monster.service'
import { ProfileController } from './profile.controller'
import { ProfileService } from './profile.service'
import { EnumMonsterAction } from './monster-engine'
import { EnumMonsterLine } from '../../../db/entities/monster.entity'

const user = { 'user-id': 'user-1' } as never

describe('MonsterController', () => {
  const service = {
    getMyMonster: jest.fn(),
    hatch: jest.fn(),
    rename: jest.fn(),
    select: jest.fn(),
    merge: jest.fn(),
    returnHome: jest.fn(),
    act: jest.fn(),
    playMinigame: jest.fn(),
    refillStamina: jest.fn(),
    getEvolutionPath: jest.fn(),
    getDex: jest.fn(),
    getHistory: jest.fn(),
  }
  const controller = new MonsterController(service as unknown as MonsterService)

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it.each([
    ['getMyMonster', () => controller.getMyMonster(user), 'getMyMonster', ['user-1']],
    [
      'hatch',
      () => controller.hatch({ line: EnumMonsterLine.FLAME }, user),
      'hatch',
      ['user-1', EnumMonsterLine.FLAME],
    ],
    [
      'rename',
      () => controller.rename({ monsterId: 'm1', name: 'Bob' }, user),
      'rename',
      ['user-1', 'm1', 'Bob'],
    ],
    ['select', () => controller.select({ monsterId: 'm1' }, user), 'select', ['user-1', 'm1']],
    [
      'merge',
      () => controller.merge({ firstId: 'a', secondId: 'b', baseId: 'a' }, user),
      'merge',
      ['user-1', 'a', 'b', 'a'],
    ],
    [
      'returnHome',
      () => controller.returnHome({ monsterId: 'm1' }, user),
      'returnHome',
      ['user-1', 'm1'],
    ],
    [
      'act',
      () => controller.act({ type: EnumMonsterAction.FEED, monsterId: 'm1' }, user),
      'act',
      ['user-1', EnumMonsterAction.FEED, 'm1'],
    ],
    [
      'playMinigame',
      () => controller.playMinigame({ hits: 3, monsterId: 'm1' }, user),
      'playMinigame',
      ['user-1', 3, 'm1'],
    ],
    [
      'refillStamina',
      () => controller.refillStamina({ monsterId: 'm1' }, user),
      'refillStamina',
      ['user-1', 'm1'],
    ],
    [
      'getEvolutionPath',
      () => controller.getEvolutionPath('m1', user),
      'getEvolutionPath',
      ['user-1', 'm1'],
    ],
    ['getDex', () => controller.getDex(user), 'getDex', ['user-1']],
    ['getHistory', () => controller.getHistory(user), 'getHistory', ['user-1']],
  ])('%s forwards the caller id and body fields', async (_name, call, method, args) => {
    const result = { ok: method }
    ;(service as Record<string, jest.Mock>)[method].mockResolvedValue(result)
    await expect(call()).resolves.toBe(result)
    expect(service[method as keyof typeof service]).toHaveBeenCalledWith(...args)
  })

  it('serves the static wiki without touching the service', () => {
    const wiki = controller.getWiki()
    expect(wiki).toBeDefined()
    expect(Object.values(service).every(fn => fn.mock.calls.length === 0)).toBe(true)
  })
})

describe('ProfileController', () => {
  const service = { ensureProfile: jest.fn(), setDisplayName: jest.fn() }
  const controller = new ProfileController(service as unknown as ProfileService)

  it('returns only the public fields of the profile', async () => {
    service.ensureProfile.mockResolvedValue({
      userId: 'user-1',
      displayName: 'Tester',
      friendCode: 'ABCD1234',
    })
    await expect(controller.getProfile(user)).resolves.toEqual({
      displayName: 'Tester',
      friendCode: 'ABCD1234',
    })
    expect(service.ensureProfile).toHaveBeenCalledWith('user-1')
  })

  it('renames and returns only the public fields', async () => {
    service.setDisplayName.mockResolvedValue({
      userId: 'user-1',
      displayName: 'Neo',
      friendCode: 'ABCD1234',
    })
    await expect(controller.setName({ displayName: 'Neo' }, user)).resolves.toEqual({
      displayName: 'Neo',
      friendCode: 'ABCD1234',
    })
    expect(service.setDisplayName).toHaveBeenCalledWith('user-1', 'Neo')
  })
})
