import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { GlobalExceptionFilter } from '../utils/filters/global-exception-filter'
import { AppVersionInterceptor } from '../utils/interceptors/app-version.interceptor'
import appConfig from './app-config'
import { useBodyParsers } from './body-parsers'

// Shared by main.ts and createTestingApp so tests run the same HTTP pipeline as production.
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  app.use(cookieParser())
  useBodyParsers(app)

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
