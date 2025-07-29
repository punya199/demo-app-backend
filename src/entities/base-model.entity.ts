import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export abstract class BaseModelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone' })
  deletedAt: Date

  @Column({ name: 'creator_id', type: 'uuid', nullable: true })
  creatorId: string

  @Column({ name: 'updater_id', type: 'uuid', nullable: true })
  updaterId: string

  @Column({ name: 'deleter_id', type: 'uuid', nullable: true })
  deleterId: string
}
