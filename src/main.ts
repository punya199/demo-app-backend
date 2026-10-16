import { NestApplication, NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import appConfig from './config/app-config'
import { configureApp } from './config/app-setup'

async function bootstrap() {
  const app = await NestFactory.create<NestApplication>(AppModule)

  app.enableShutdownHooks()
  configureApp(app)

  await app.listen(appConfig.PORT)
  console.log(`Server is running on port ${appConfig.PORT} ${appConfig.APP_VERSION || '-'}`)
}

void bootstrap()
