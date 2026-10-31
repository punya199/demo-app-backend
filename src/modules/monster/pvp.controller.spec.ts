import { PvpController } from './pvp.controller'
import { PvpService } from './pvp.service'

// Rented allies are for world bosses only. The arena has no ally at all: the controller hands the
// service just an opponent id, and the 1-vs-1 engine has no second fighter to give.
describe('PvpController', () => {
  it('ignores a support unit smuggled into the arena request', async () => {
    const battle = jest.fn().mockResolvedValue({})
    const controller = new PvpController({ battle } as unknown as PvpService)
    const body = { opponentId: 'npc:adult:0', supportId: 'a-friends-unit' } as never
    await controller.battle(body, { 'user-id': 'user-1' } as never)
    expect(battle).toHaveBeenCalledWith('user-1', 'npc:adult:0')
    expect(battle.mock.calls[0]).toHaveLength(2)
  })

  it('has no ally parameter in the service call', () => {
    // userId and opponentId: a rental can't be passed even by mistake
    expect(PvpService.prototype.battle.length).toBe(2)
  })
})
