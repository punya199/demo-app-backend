import { loadPassiveBonus } from '../passive/passive.service'
import { recordQuestProgress } from '../adventure/quest.service'
import { addToBag } from '../inventory/inventory-bag'
import { MonsterService } from './monster.service'
import { loadSpecialBonus } from './special-bonus'
import { fakeDataSource, fakeEtm, fakeInsertBuilder, NOW } from './core-test-helpers'

// Specs using this must jest.mock the four collaborators below (the factories live in each spec,
// since jest hoists mocks per file).
export const mocks = {
  passive: loadPassiveBonus as jest.Mock,
  special: loadSpecialBonus as jest.Mock,
  quests: recordQuestProgress as jest.Mock,
  bag: addToBag as jest.Mock,
}

export const setup = () => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  const etm = fakeEtm()
  const repo = { find: jest.fn(), findOne: jest.fn() }
  const dataSource = fakeDataSource(etm)
  const wallet = { change: jest.fn().mockResolvedValue({ gem: 1 }) }
  etm.createQueryBuilder.mockReturnValue(fakeInsertBuilder({ raw: [] }))
  const service = new MonsterService(repo as never, dataSource as never, wallet as never)
  mocks.passive.mockResolvedValue({ hungerDrainMultiplier: 1 })
  mocks.special.mockResolvedValue({ hungerDrainMultiplier: 1, poopRateMultiplier: 1 })
  mocks.quests.mockResolvedValue(undefined)
  mocks.bag.mockResolvedValue(undefined)
  return { etm, repo, dataSource, wallet, service }
}
