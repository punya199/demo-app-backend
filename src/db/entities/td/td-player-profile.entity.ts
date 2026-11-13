import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

// Tower Defense lives in the Postgres schema `td`. `userId` points at public.users by value only:
// no cross-schema foreign key, and nothing else about the person is stored here.
@Entity({ schema: 'td', name: 'player_profile' })
export class TdPlayerProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string

  // Stored value as of `energyUpdatedAt`; the current value is derived (see modules/td/energy.ts).
  @Column({ name: 'energy', type: 'integer' })
  energy: number

  @Column({ name: 'energy_updated_at', type: 'timestamp with time zone' })
  energyUpdatedAt: Date

  // Version of the save-data shape, so later milestones can migrate stored game state.
  @Column({ name: 'save_version', type: 'integer', default: 1 })
  saveVersion: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date
}
