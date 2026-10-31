import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

export enum EnumWalletCurrency {
  COIN = 'coin',
  GEM = 'gem',
  RAID_TOKEN = 'raid_token',
}

export enum EnumWalletTransactionReason {
  BATTLE_REWARD = 'battle_reward',
  SHOP_PURCHASE = 'shop_purchase',
  BOSS_FIRST_CLEAR = 'boss_first_clear',
  DEX_DISCOVERY = 'dex_discovery',
  STAMINA_REFILL = 'stamina_refill',
  DAILY_QUEST = 'daily_quest',
  EXPEDITION_REWARD = 'expedition_reward',
  AUTO_BATTLE_REWARD = 'auto_battle_reward',
  EQUIPMENT_BOX = 'equipment_box',
  ENHANCE = 'enhance',
  PVP_REWARD = 'pvp_reward',
  PVP_SEASON_REWARD = 'pvp_season_reward',
  RAID_REWARD = 'raid_reward',
}

@Entity({
  name: 'wallet_transactions',
})
@Index('IDX_wallet_transactions_user_id', ['userId'], {
  where: 'deleted_at IS NULL',
})
export class WalletTransactionEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'currency', type: 'varchar' })
  currency: EnumWalletCurrency

  // Positive = earned, negative = spent.
  @Column({ name: 'amount', type: 'integer' })
  amount: number

  @Column({ name: 'balance_after', type: 'integer' })
  balanceAfter: number

  @Column({ name: 'reason', type: 'varchar' })
  reason: EnumWalletTransactionReason

  // What the change was for, e.g. the adventure stage id or shop item id.
  @Column({ name: 'ref_id', type: 'varchar', nullable: true })
  refId: string | null

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_wallet_transactions_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
