import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { MonsterEntity } from './monster.entity'
import { UserEntity } from './user.entity'

// Owned per user and worn by one pet at a time (`monster_id`, set while `equipped`): when that pet
// dies or is merged away, the piece returns to the bag. Pieces are data-driven
// (template_id from src/modules/monster/equipment-data.ts); rules for stats, sets and enhancing
// live in equipment-data.ts and enhance-engine.ts. A broken piece is soft-deleted.
@Entity({
  name: 'equipment_items',
})
@Index('IDX_equipment_items_user_id', ['userId'], {
  where: 'deleted_at IS NULL',
})
@Index('IDX_equipment_items_monster_id_slot_equipped', ['monsterId', 'slot'], {
  unique: true,
  where: 'equipped AND deleted_at IS NULL',
})
export class EquipmentItemEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'template_id', type: 'varchar' })
  templateId: string

  @Column({ name: 'slot', type: 'varchar' })
  slot: string

  @Column({ name: 'set_id', type: 'varchar', nullable: true })
  setId: string | null

  @Column({ name: 'grade', type: 'varchar' })
  grade: string

  // Main stat at +0; the enhance level scales it when read.
  @Column({ name: 'main_value', type: 'integer' })
  mainValue: number

  @Column({ name: 'sub_stats', type: 'jsonb', default: {} })
  subStats: Record<string, number>

  // Care perks for the wearer: [{ key, value }]. See SPECIAL_DEFINITIONS.
  @Column({ name: 'special_options', type: 'jsonb', default: [] })
  specialOptions: { key: string; value: number }[]

  // A refine roll waiting to be kept or discarded: the stat line and its new value. Stats keep
  // using the old value until it is kept.
  @Column({ name: 'pending_refine', type: 'jsonb', nullable: true })
  pendingRefine: { key: string; value: number } | null

  @Column({ name: 'enhance_level', type: 'integer', default: 0 })
  enhanceLevel: number

  // Consecutive failed enhance attempts on this piece (see PITY_* in enhance-engine.ts).
  @Column({ name: 'pity', type: 'integer', default: 0 })
  pity: number

  @Column({ name: 'equipped', type: 'boolean', default: false })
  equipped: boolean

  // The pet wearing this piece; null in the bag.
  @Column({ name: 'monster_id', type: 'uuid', nullable: true })
  monsterId: string | null

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_equipment_items_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity

  @JoinColumn({ name: 'monster_id', foreignKeyConstraintName: 'FK_equipment_items_monster_id' })
  @ManyToOne(() => MonsterEntity, { onDelete: 'SET NULL' })
  monster: MonsterEntity | null
}
