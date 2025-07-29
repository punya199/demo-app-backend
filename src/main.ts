import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))

  // เปิด ValidationPipe
  app.useGlobalPipes(new ValidationPipe())
  app.enableCors()
  await app.listen(3000)
}

void bootstrap()
