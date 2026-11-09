import { EntityManager } from 'typeorm'
import { PlayerCostumeEntity } from '../../../db/entities/player-costume.entity'

// Kept apart from costume.service so reward code (quests) can grant one without pulling in MonsterService.
// Gives a costume (a reward); a second grant of the same one changes nothing.
export const grantCostume = async (userId: string, costumeId: string, etm: EntityManager) => {
  const inserted = await etm
    .createQueryBuilder()
    .insert()
    .into(PlayerCostumeEntity)
    .values({ userId, costumeId })
    .orIgnore()
    .returning(['id'])
    .execute()
  return (inserted.raw as unknown[]).length > 0
}
