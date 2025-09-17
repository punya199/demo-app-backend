import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { NestApplication, NestFactory, Reflector } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { json, urlencoded } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import appConfig from './config/app-config'
import { GlobalExceptionFilter } from './utils/filters/global-exception-filter'

async function bootstrap() {
  const app = await NestFactory.create<NestApplication>(AppModule)

  app.use(cookieParser())
  app.use(json({ limit: '50mb' }))
  app.use(urlencoded({ limit: '50mb', extended: true }))

  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))
  // เปิด ValidationPipe
  app.useGlobalPipes(new ValidationPipe())
  app.enableCors({
    origin: appConfig.ORIGIN_ALLOWED.includes('*') ? '*' : appConfig.ORIGIN_ALLOWED,
    credentials: true,
  })
  app.use(helmet())

  await app.listen(appConfig.PORT)
  console.log(`Server is running on port ${appConfig.PORT} ${appConfig.APP_VERSION || '-'}`)
}

void bootstrap()
