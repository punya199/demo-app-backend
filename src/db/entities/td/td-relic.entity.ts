import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

// One row per relic a player has unlocked; (user, relic) is unique so a relic unlocks once.
// `relicId` is a td-sim RELICS key. The unlock is paid through the currency ledger.
@Entity({ schema: 'td', name: 'relic' })
@Unique('UQ_td_relic_user_relic', ['userId', 'relicId'])
export class TdRelicEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'relic_id', type: 'varchar', length: 32 })
  relicId: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
