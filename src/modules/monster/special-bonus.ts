import { EntityManager } from 'typeorm'
import { EquipmentItemEntity } from '../../db/entities/equipment-item.entity'
import { calcSpecialBonuses, ISpecialOption } from './equipment-data'

// The care perks (slow hunger, cheaper fights, ...) of what one pet wears. Kept apart from
// equipment.service so monster.service can use it without a circular import.
export const loadSpecialBonus = async (monsterId: string, etm: EntityManager) =>
  calcSpecialBonuses(
    (await etm.find(EquipmentItemEntity, { where: { monsterId, equipped: true } })).map(row => ({
      specialOptions: row.specialOptions as ISpecialOption[],
      setId: row.setId,
    }))
  )
