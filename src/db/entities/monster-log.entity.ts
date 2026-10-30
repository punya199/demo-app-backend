import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { MonsterEntity } from './monster.entity'

export enum EnumMonsterLogType {
  HATCH = 'hatch',
  ACTION = 'action',
  EVOLVE = 'evolve',
  CARE_MISTAKE = 'care_mistake',
  SICK = 'sick',
  DEATH = 'death',
}

@Entity({
  name: 'monster_logs',
})
@Index('IDX_monster_logs_monster_id', ['monsterId'], {
  where: 'deleted_at IS NULL',
})
export class MonsterLogEntity extends BaseModelEntity {
  @Column({ name: 'monster_id', type: 'uuid' })
  monsterId: string

  @Column({ name: 'type', type: 'varchar' })
  type: EnumMonsterLogType

  @Column({ name: 'payload', type: 'jsonb', default: {} })
  payload: Record<string, unknown>

  @JoinColumn({ name: 'monster_id', foreignKeyConstraintName: 'FK_monster_logs_monster_id' })
  @ManyToOne(() => MonsterEntity)
  monster: MonsterEntity
}
