import { DataSource } from 'typeorm'

import { Bill } from '../bill/bill.entity'
import { User } from '../user/user.entity'
import appConfig from './app-config'

// Determine if we're running in production (compiled JS) or development (TS)
const isProduction = process.env.NODE_ENV === 'production' || __filename.endsWith('.js')

export default new DataSource({
  type: 'postgres',
  host: appConfig.DATABASE_HOST,
  port: appConfig.DATABASE_PORT,
  username: appConfig.DATABASE_USER,
  password: appConfig.DATABASE_PASSWORD,
  database: appConfig.DATABASE_NAME,
  ssl: appConfig.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  entities: isProduction ? ['dist/**/*.entity.js'] : [User, Bill],
  migrations: isProduction ? ['dist/migrations/*.js'] : ['src/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false, // Important: disable for production
  logging: ['query', 'error'],
})
