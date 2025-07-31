// src/app.module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClsModule } from 'nestjs-cls'
import { LoggerModule } from 'nestjs-pino'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import appConfig, { validationSchema } from './config/app-config'
import { clsServiceConfig } from './config/cls-service-config'
import { entities } from './config/database.config'
import { pinoConfig } from './config/pino-config'
import { AttachmentModule } from './modules/attachment/attachment.module'
import { BillModule } from './modules/bill/bill.module'
import { HouseRentModule } from './modules/house-rent/house-rent.module'
import { UserModule } from './modules/user/user.module'

@Module({
  imports: [
    ClsModule.forRoot(clsServiceConfig),
    LoggerModule.forRoot(pinoConfig),
    ConfigModule.forRoot({
      isGlobal: true, // ทำให้ config ใช้ได้ทั่วทั้งแอป
      validationSchema: validationSchema, // ใช้ schema สำหรับ validate config
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: appConfig.DATABASE_HOST, // หรือชื่อ container docker ก็ได้
      port: appConfig.DATABASE_PORT,
      username: appConfig.DATABASE_USER,
      password: appConfig.DATABASE_PASSWORD,
      database: appConfig.DATABASE_NAME,
      ssl: appConfig.DATABASE_SSL ? { rejectUnauthorized: false } : false,
      entities: entities,
      migrations: ['dist/migrations/*.js'], // Use compiled JS files in production
      migrationsTableName: 'migrations',
      synchronize: false, // Disabled for production - use migrations instead
      migrationsRun: false, // Don't auto-run migrations
      logging: 'all',
      uuidExtension: 'pgcrypto',
    }),
    UserModule,
    BillModule,
    HouseRentModule,
    AttachmentModule,
  ],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule {}
