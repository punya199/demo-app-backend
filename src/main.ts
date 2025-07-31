import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import { json, urlencoded } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import appConfig from './config/app-config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(json({ limit: '100mb' }))
  app.use(urlencoded({ limit: '100mb', extended: true }))

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))
  // เปิด ValidationPipe
  app.useGlobalPipes(new ValidationPipe())
  app.enableCors()
  app.use(helmet())

  await app.listen(appConfig.PORT)
  console.log(`Server is running on port ${appConfig.PORT} ${appConfig.APP_VERSION || '-'}`)
}

void bootstrap()
