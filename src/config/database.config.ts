import { DataSource } from 'typeorm'

import { AttachmentEntity } from '../db/entities/attachment.entity'
import { BillEntity } from '../db/entities/bill.entity'
import { HouseRentEntity } from '../db/entities/house-rent'
import { HouseRentDetailEntity } from '../db/entities/house-rent-detail.entity'
import { HouseRentMemberEntity } from '../db/entities/house-rent-member.entity'
import { PermissionsEntity } from '../db/entities/permissions'
import { UserEntity } from '../db/entities/user.entity'
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
  entities: isProduction ? ['dist/**/*.entity.js'] : entities,
  subscribers: isProduction ? ['dist/**/*.subscriber.js'] : subscribers,
  migrations: isProduction ? ['dist/db/migrations/*.js'] : ['src/db/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false, // Important: disable for production
  logging: ['query', 'error'],
})
