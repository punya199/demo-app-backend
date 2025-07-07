// src/app.module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import appConfig, { validationSchema } from './config/app-config'
import { User } from './user/user.entity'
import { UserModule } from './user/user.module'

@Module({
  imports: [
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
      entities: [User],
      migrations: ['dist/migrations/*.js'], // Use compiled JS files in production
      migrationsTableName: 'migrations',
      synchronize: false, // Disabled for production - use migrations instead
      migrationsRun: false, // Don't auto-run migrations
      logging: 'all',
      uuidExtension: 'pgcrypto',
    }),
    UserModule,
  ],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule {}
