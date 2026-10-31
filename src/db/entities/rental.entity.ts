import { Column, Entity, Index } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'

// A rented support unit used against a world boss. `fee` is what the renter really paid the owner
// (capped by the owner's daily earnings), and the sum of today's fees is the owner's income so far.
// `ally_damage` is what the unit took off the boss: it counts for the boss's HP, not for the
// renter's ranking.
@Entity({
  name: 'rentals',
})
@Index('IDX_rentals_owner_id_created_at', ['ownerId', 'createdAt'], {
  where: 'deleted_at IS NULL',
})
export class RentalEntity extends BaseModelEntity {
  @Column({ name: 'renter_id', type: 'uuid' })
  renterId: string

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string

  @Column({ name: 'support_unit_id', type: 'uuid' })
  supportUnitId: string

  @Column({ name: 'world_boss_id', type: 'uuid' })
  worldBossId: string

  @Column({ name: 'fee', type: 'integer' })
  fee: number

  @Column({ name: 'ally_damage', type: 'integer' })
  allyDamage: number
}
