import { IAppJwtPayload } from '../../auth/auth.interface'
import { MonsterAdventureModule } from './adventure.module'
import { AdventureController } from './adventure.controller'
import { ExpeditionController } from './expedition.controller'
import { QuestController } from './quest.controller'

const user = { 'user-id': 'u1' } as unknown as IAppJwtPayload

describe('AdventureController', () => {
  const service = { getAdventure: jest.fn(), battle: jest.fn(), skip: jest.fn() }
  const controller = new AdventureController(service as never)

  it('passes the user id and body to the service', async () => {
    service.getAdventure.mockResolvedValue('adv')
    service.battle.mockResolvedValue('battle')
    service.skip.mockResolvedValue('skip')
    await expect(controller.getAdventure(user)).resolves.toBe('adv')
    await expect(controller.battle({ stageId: 's1' }, user)).resolves.toBe('battle')
    await expect(controller.skip({ stageId: 's1', runs: 3 }, user)).resolves.toBe('skip')
    expect(service.getAdventure).toHaveBeenCalledWith('u1')
    expect(service.battle).toHaveBeenCalledWith('u1', 's1')
    expect(service.skip).toHaveBeenCalledWith('u1', 's1', 3)
  })
})

describe('ExpeditionController', () => {
  const service = { getExpedition: jest.fn(), start: jest.fn(), claim: jest.fn() }
  const controller = new ExpeditionController(service as never)

  it('passes the user id and body to the service', async () => {
    service.getExpedition.mockResolvedValue('exp')
    service.start.mockResolvedValue('start')
    service.claim.mockResolvedValue('claim')
    await expect(controller.getExpedition(user)).resolves.toBe('exp')
    await expect(controller.start({ areaId: 'meadow' }, user)).resolves.toBe('start')
    await expect(controller.claim(user)).resolves.toBe('claim')
    expect(service.getExpedition).toHaveBeenCalledWith('u1')
    expect(service.start).toHaveBeenCalledWith('u1', 'meadow')
    expect(service.claim).toHaveBeenCalledWith('u1')
  })
})

describe('QuestController', () => {
  const service = { getQuests: jest.fn(), claim: jest.fn(), claimLogin: jest.fn() }
  const controller = new QuestController(service as never)

  it('passes the user id and body to the service', async () => {
    service.getQuests.mockResolvedValue('quests')
    service.claim.mockResolvedValue('claim')
    service.claimLogin.mockResolvedValue('login')
    await expect(controller.getQuests(user)).resolves.toBe('quests')
    await expect(controller.claim({ questId: 'feed' } as never, user)).resolves.toBe('claim')
    await expect(controller.claimLogin(user)).resolves.toBe('login')
    expect(service.getQuests).toHaveBeenCalledWith('u1')
    expect(service.claim).toHaveBeenCalledWith('u1', 'feed')
    expect(service.claimLogin).toHaveBeenCalledWith('u1')
  })
})

describe('MonsterAdventureModule', () => {
  it('wires the three controllers and services', () => {
    expect(Reflect.getMetadata('controllers', MonsterAdventureModule)).toHaveLength(3)
    expect(Reflect.getMetadata('providers', MonsterAdventureModule)).toHaveLength(3)
  })
})
