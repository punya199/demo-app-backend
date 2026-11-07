import { PassiveController } from './passive.controller'
import { MonsterPassiveModule } from './passive.module'
import { PassiveService } from './passive.service'
import { SkillController } from './skill.controller'
import { SkillService } from './skill.service'

const user = { 'user-id': 'user-1' } as never

describe('PassiveController', () => {
  const service = {
    getState: jest.fn(),
    save: jest.fn(),
    allocate: jest.fn(),
    deallocate: jest.fn(),
    deallocateBranch: jest.fn(),
    pickMastery: jest.fn(),
    allocateAscendancy: jest.fn(),
    resetAscendancy: jest.fn(),
    respec: jest.fn(),
  }
  const controller = new PassiveController(service as unknown as PassiveService)
  const draft = { nodeIds: ['a'], masteries: {}, ascendancyNodeIds: [] }

  it.each([
    ['getState', () => controller.getState(user), ['user-1']],
    ['save', () => controller.save(draft, user), ['user-1', draft]],
    ['allocate', () => controller.allocate({ nodeId: 'n' }, user), ['user-1', 'n']],
    ['deallocate', () => controller.deallocate({ nodeId: 'n' }, user), ['user-1', 'n']],
    ['deallocateBranch', () => controller.deallocateBranch({ nodeId: 'n' }, user), ['user-1', 'n']],
    [
      'pickMastery',
      () => controller.pickMastery({ nodeId: 'n', option: 2 }, user),
      ['user-1', 'n', 2],
    ],
    [
      'allocateAscendancy',
      () => controller.allocateAscendancy({ nodeId: 'n' }, user),
      ['user-1', 'n'],
    ],
    ['resetAscendancy', () => controller.resetAscendancy(user), ['user-1']],
    ['respec', () => controller.respec(user), ['user-1']],
  ])('%s forwards the caller id and body', async (method, call, args) => {
    const result = { ok: method }
    ;(service as Record<string, jest.Mock>)[method].mockResolvedValue(result)
    await expect(call()).resolves.toBe(result)
    expect(service[method as keyof typeof service]).toHaveBeenCalledWith(...args)
  })
})

describe('SkillController', () => {
  const service = { getState: jest.fn(), setLoadout: jest.fn() }
  const controller = new SkillController(service as unknown as SkillService)

  it('reads the state of the caller', async () => {
    service.getState.mockResolvedValue({ ok: true })
    await expect(controller.getState(user)).resolves.toEqual({ ok: true })
    expect(service.getState).toHaveBeenCalledWith('user-1')
  })

  it('passes the given loadout and monster id', async () => {
    await controller.setLoadout({ s1: 'a', s2: 'b', dodge: 'c', monsterId: 'm1' }, user)
    expect(service.setLoadout).toHaveBeenCalledWith(
      'user-1',
      { s1: 'a', s2: 'b', dodge: 'c' },
      'm1'
    )
  })

  it('fills omitted slots with null', async () => {
    service.setLoadout.mockClear()
    await controller.setLoadout({} as never, user)
    expect(service.setLoadout).toHaveBeenCalledWith(
      'user-1',
      { s1: null, s2: null, dodge: null },
      undefined
    )
  })
})

describe('MonsterPassiveModule', () => {
  it('registers both controllers and services', () => {
    expect(Reflect.getMetadata('controllers', MonsterPassiveModule)).toEqual([
      PassiveController,
      SkillController,
    ])
    expect(Reflect.getMetadata('providers', MonsterPassiveModule)).toEqual([
      PassiveService,
      SkillService,
    ])
  })
})
