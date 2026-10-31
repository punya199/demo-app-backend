import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

export enum EnumEquipmentLogType {
  OBTAIN = 'obtain',
  EQUIP = 'equip',
  UNEQUIP = 'unequip',
  DISMANTLE = 'dismantle',
}

// Audit trail of every random roll and change to a user's equipment.
@Entity({
  name: 'equipment_logs',
})
@Index('IDX_equipment_logs_user_id', ['userId'], {
  where: 'deleted_at IS NULL',
})
export class EquipmentLogEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'equipment_id', type: 'uuid', nullable: true })
  equipmentId: string | null

  @Column({ name: 'type', type: 'varchar' })
  type: EnumEquipmentLogType

  @Column({ name: 'payload', type: 'jsonb', default: {} })
  payload: Record<string, unknown>

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_equipment_logs_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
