import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

// One row per player. Persisted so the Legendary guarantee survives across sessions.
@Entity({ schema: 'td', name: 'gacha_pity' })
export class TdGachaPityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string

  // Pulls since the last Legendary.
  @Column({ name: 'pity', type: 'integer', default: 0 })
  pity: number

  // UTC calendar day (YYYY-MM-DD) of the last free pull.
  @Column({ name: 'last_free_pull_on', type: 'date', nullable: true })
  lastFreePullOn: string | null
}
