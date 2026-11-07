import { EnumEquipmentSlot } from './equipment-data'
import { EquipmentController } from './equipment.controller'
import { USER } from './equipment-test-helpers'

describe('EquipmentController', () => {
  const user = { 'user-id': USER } as never
  const equipment = {
    getEquipment: jest.fn().mockResolvedValue('screen'),
    equip: jest.fn().mockResolvedValue('equip'),
    unequip: jest.fn().mockResolvedValue('unequip'),
    dismantle: jest.fn().mockResolvedValue('dismantle'),
    dismantleMany: jest.fn().mockResolvedValue('many'),
    refine: jest.fn().mockResolvedValue('refine'),
    resolveRefine: jest.fn().mockResolvedValue('resolve'),
  }
  const enhance = {
    getPreview: jest.fn().mockResolvedValue('preview'),
    enhance: jest.fn().mockResolvedValue('enhance'),
  }
  const controller = new EquipmentController(equipment as never, enhance as never)
  beforeEach(() => jest.clearAllMocks())

  it('reads the screen with the optional monster id', async () => {
    expect(await controller.getEquipment(user, 'pet-1')).toBe('screen')
    expect(equipment.getEquipment).toHaveBeenCalledWith(USER, undefined, 'pet-1')
  })

  it('equip defaults move to false and passes it through when set', async () => {
    await controller.equip({ equipmentId: 'e', monsterId: 'p' } as never, user)
    expect(equipment.equip).toHaveBeenLastCalledWith(USER, 'e', 'p', false)
    await controller.equip({ equipmentId: 'e', move: true } as never, user)
    expect(equipment.equip).toHaveBeenLastCalledWith(USER, 'e', undefined, true)
  })

  it('delegates the remaining equipment routes', async () => {
    await controller.unequip({ slot: EnumEquipmentSlot.ARMOR, monsterId: 'p' } as never, user)
    expect(equipment.unequip).toHaveBeenCalledWith(USER, 'armor', 'p')
    await controller.dismantle({ equipmentId: 'e' } as never, user)
    expect(equipment.dismantle).toHaveBeenCalledWith(USER, 'e')
    await controller.dismantleMany({ equipmentIds: ['a', 'b'] } as never, user)
    expect(equipment.dismantleMany).toHaveBeenCalledWith(USER, ['a', 'b'])
    await controller.refine({ equipmentId: 'e', line: 'hp' } as never, user)
    expect(equipment.refine).toHaveBeenCalledWith(USER, 'e', 'hp')
    await controller.resolveRefine({ equipmentId: 'e', keep: true } as never, user)
    expect(equipment.resolveRefine).toHaveBeenCalledWith(USER, 'e', true)
  })

  it('previews and enhances, defaulting useProtect to false', async () => {
    expect(await controller.getEnhancePreview('e', user)).toBe('preview')
    expect(enhance.getPreview).toHaveBeenCalledWith(USER, 'e')
    await controller.enhance({ equipmentId: 'e' } as never, user)
    expect(enhance.enhance).toHaveBeenLastCalledWith(USER, 'e', false)
    await controller.enhance({ equipmentId: 'e', useProtect: true } as never, user)
    expect(enhance.enhance).toHaveBeenLastCalledWith(USER, 'e', true)
  })
})
