import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { PollEntity } from './poll.entity'

@Entity({
  name: 'poll_options',
})
@Index(['pollId'], {
  where: 'deleted_at IS NULL',
})
export class PollOptionEntity extends BaseModelEntity {
  @Column({ name: 'poll_id', type: 'uuid' })
  pollId: string

  @Column({ name: 'label', type: 'varchar' })
  label: string

  @Column({ name: 'order', type: 'integer' })
  order: number

  @JoinColumn({ name: 'poll_id' })
  @ManyToOne(() => PollEntity, poll => poll.options)
  poll: PollEntity
}
