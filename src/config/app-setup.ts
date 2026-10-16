import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { json, urlencoded } from 'express'
import helmet from 'helmet'
import { GlobalExceptionFilter } from '../utils/filters/global-exception-filter'
import { AppVersionInterceptor } from '../utils/interceptors/app-version.interceptor'
import appConfig from './app-config'

// Shared by main.ts and createTestingApp so tests run the same HTTP pipeline as production.
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  app.use(cookieParser())
  app.use(json({ limit: '50mb' }))
  app.use(urlencoded({ limit: '50mb', extended: true }))

  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new AppVersionInterceptor()
  )
  // เปิด ValidationPipe
  app.useGlobalPipes(new ValidationPipe({ transform: true }))
  app.enableCors({
    origin: appConfig.ORIGIN_ALLOWED,
    credentials: true,
    exposedHeaders: ['X-App-Version'],
  })
  app.use(helmet())
}
