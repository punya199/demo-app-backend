import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// One row per user, created lazily on their first coin change. Always change `coin`/`gem` through
// WalletService so every change is row-locked and recorded in wallet_transactions.
@Entity({
  name: 'wallets',
})
@Index('IDX_wallets_user_id', ['userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class WalletEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'coin', type: 'integer', default: 0 })
  coin: number

  @Column({ name: 'gem', type: 'integer', default: 0 })
  gem: number

  // Earned from Boss Raid, World Boss and PvP seasons; spent on protect scrolls.
  @Column({ name: 'raid_token', type: 'integer', default: 0 })
  raidToken: number

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_wallets_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
