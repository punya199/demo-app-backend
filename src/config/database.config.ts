import { DataSource } from 'typeorm'

import { AttachmentEntity } from '../db/entities/attachment.entity'
import { BillEntity } from '../db/entities/bill.entity'
import { HouseRentEntity } from '../db/entities/house-rent'
import { HouseRentDetailEntity } from '../db/entities/house-rent-detail.entity'
import { HouseRentMemberEntity } from '../db/entities/house-rent-member.entity'
import { AdventureProgressEntity } from '../db/entities/adventure-progress.entity'
import { EnhanceLogEntity } from '../db/entities/enhance-log.entity'
import { EquipmentItemEntity } from '../db/entities/equipment-item.entity'
import { EquipmentLogEntity } from '../db/entities/equipment-log.entity'
import { DailyQuestProgressEntity } from '../db/entities/daily-quest-progress.entity'
import { InventoryItemEntity } from '../db/entities/inventory-item.entity'
import { LedgerItemEntity } from '../db/entities/ledger-item.entity'
import { MonsterDexEntity } from '../db/entities/monster-dex.entity'
import { MonsterLogEntity } from '../db/entities/monster-log.entity'
import { MonsterEntity } from '../db/entities/monster.entity'
import { PermissionsEntity } from '../db/entities/permissions'
import { PollOptionEntity } from '../db/entities/poll-option.entity'
import { PollVoteEntity } from '../db/entities/poll-vote.entity'
import { PollEntity } from '../db/entities/poll.entity'
import { UserEntity } from '../db/entities/user.entity'
import { WalletTransactionEntity } from '../db/entities/wallet-transaction.entity'
import { WalletEntity } from '../db/entities/wallet.entity'
import { AuditSubscriber } from '../db/subscribers/audit.subscriber'
import appConfig from './app-config'

// Determine if we're running in production (compiled JS) or development (TS)
const isProduction = process.env.NODE_ENV === 'production' || __filename.endsWith('.js')

export const entities = [
  UserEntity,
  BillEntity,
  HouseRentEntity,
  HouseRentMemberEntity,
  HouseRentDetailEntity,
  AttachmentEntity,
  PermissionsEntity,
  LedgerItemEntity,
  PollEntity,
  PollOptionEntity,
  PollVoteEntity,
  MonsterEntity,
  MonsterLogEntity,
  MonsterDexEntity,
  AdventureProgressEntity,
  WalletEntity,
  WalletTransactionEntity,
  InventoryItemEntity,
  DailyQuestProgressEntity,
  EquipmentItemEntity,
  EquipmentLogEntity,
  EnhanceLogEntity,
]

export const subscribers = [AuditSubscriber]
export default new DataSource({
  type: 'postgres',
  host: appConfig.DATABASE_HOST,
  port: appConfig.DATABASE_PORT,
  username: appConfig.DATABASE_USER,
  password: appConfig.DATABASE_PASSWORD,
  database: appConfig.DATABASE_NAME,
  ssl: appConfig.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  entities,
  subscribers: isProduction ? ['dist/**/*.subscriber.js'] : subscribers,
  migrations: isProduction ? ['dist/db/migrations/*.js'] : ['src/db/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false, // Important: disable for production
  logging: ['query', 'error'],
})
