import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

// Append-only log of every pull. `seed` and `pityBefore` are enough to re-run rollHero and verify
// the result.
@Entity({ schema: 'td', name: 'gacha_pull' })
export class TdGachaPullEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // Groups the pulls of one request (a 10-pull shares one id).
  @Column({ name: 'batch_id', type: 'uuid' })
  batchId: string

  @Column({ name: 'seed', type: 'bigint' })
  seed: string

  @Column({ name: 'pity_before', type: 'integer' })
  pityBefore: number

  @Column({ name: 'hero_id', type: 'varchar' })
  heroId: string

  @Column({ name: 'rarity', type: 'varchar' })
  rarity: string

  @Column({ name: 'duplicate', type: 'boolean' })
  duplicate: boolean

  // 'single' | 'ten' | 'free'
  @Column({ name: 'mode', type: 'varchar' })
  mode: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
