import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

export enum EnumTdCurrency {
  COINS = 'coins',
  GEMS = 'gems',
  SHARDS = 'shards',
  CLOVERS = 'clovers',
}

// Append-only: a balance is the SUM of a user's rows, never a mutable total. Never update or
// delete a row; correct a mistake with a compensating entry.
@Entity({ schema: 'td', name: 'currency_ledger' })
export class TdCurrencyLedgerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'currency', type: 'varchar' })
  currency: EnumTdCurrency

  // Positive for income, negative for spending.
  @Column({ name: 'amount', type: 'integer' })
  amount: number

  @Column({ name: 'reason', type: 'varchar' })
  reason: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
