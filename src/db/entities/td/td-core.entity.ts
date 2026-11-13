import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

// One row per core a player owns. `slot` is the equipped slot (0 to CORE_SLOTS - 1) or null when
// not equipped; a slot holds at most one core (partial unique index). `source` says where the core
// came from ('stage:<id>' for a first clear) and is unique per user, so a repeated or concurrent
// grant creates at most one core. Rarity is raised in place by promotion.
@Entity({ schema: 'td', name: 'core' })
@Unique('UQ_td_core_user_source', ['userId', 'source'])
@Index('UQ_td_core_user_slot', ['userId', 'slot'], { unique: true, where: '"slot" IS NOT NULL' })
export class TdCoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // 'fire' | 'ice' | 'nature' | 'physical'
  @Column({ name: 'element', type: 'varchar', length: 16 })
  element: string

  // 'common' | 'rare' | 'epic' | 'legendary'
  @Column({ name: 'rarity', type: 'varchar', length: 16 })
  rarity: string

  @Column({ name: 'slot', type: 'integer', nullable: true })
  slot: number | null

  @Column({ name: 'source', type: 'varchar', length: 32 })
  source: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
