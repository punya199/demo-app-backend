import { Column, Entity, Index, OneToMany } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { PollOptionEntity } from './poll-option.entity'

export enum EnumPollType {
  SINGLE = 'single',
  MULTIPLE = 'multiple',
  RANKING = 'ranking',
}

@Entity({
  name: 'polls',
})
@Index(['slug'], {
  where: 'deleted_at IS NULL',
  unique: true,
})
@Index(['creatorId'], {
  where: 'deleted_at IS NULL',
})
export class PollEntity extends BaseModelEntity {
  @Column({ name: 'title', type: 'varchar' })
  title: string

  @Column({ name: 'description', type: 'varchar', nullable: true })
  description: string | null

  @Column({ name: 'slug', type: 'varchar' })
  slug: string

  @Column({ name: 'poll_type', type: 'varchar' })
  pollType: EnumPollType

  @Column({ name: 'max_selections', type: 'integer', nullable: true })
  maxSelections: number | null

  @Column({ name: 'closes_at', type: 'timestamp with time zone', nullable: true })
  closesAt: Date | null

  @Column({ name: 'closed_at', type: 'timestamp with time zone', nullable: true })
  closedAt: Date | null

  @OneToMany(() => PollOptionEntity, option => option.poll)
  options: PollOptionEntity[]
}
