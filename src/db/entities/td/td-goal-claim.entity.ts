import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

// One row per paid goal, track day or achievement. The unique (user, claim key) pair is what makes
// a double or concurrent claim pay exactly once. Never updated or deleted.
@Entity({ schema: 'td', name: 'goal_claim' })
@Unique('UQ_td_goal_claim_user_key', ['userId', 'claimKey'])
export class TdGoalClaimEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // 'daily:<UTC day>:<goal id>' | 'track:<n>' | 'ach:<achievement id>'
  @Column({ name: 'claim_key', type: 'varchar', length: 64 })
  claimKey: string

  // UTC day (YYYY-MM-DD) the claim was made on.
  @Column({ name: 'claimed_on', type: 'varchar', length: 10 })
  claimedOn: string

  @Column({ name: 'gems', type: 'integer' })
  gems: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
