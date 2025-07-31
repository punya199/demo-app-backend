import { JwtModule, JwtService } from '@nestjs/jwt'
import { Request } from 'express'
import { ClsModuleAsyncOptions, ClsService } from 'nestjs-cls'
import { Payload } from '../modules/user/jwt.strategy'

export const clsServiceConfig: ClsModuleAsyncOptions = {
  global: true,
  imports: [JwtModule],
  inject: [JwtService],
  useFactory: (jwt: JwtService) => ({
    global: true,
    middleware: {
      mount: true,
      generateId: true,
      setup: (cls: ClsService, request: Request) => {
        const token = request.headers['authorization']?.split(' ')?.[1]?.toString()

        if (token) {
          const payload: Payload = jwt.decode(token)
          const userId = payload?.sub?.toString()
          if (userId) {
            cls.set('userId', userId)
          }
        }
      },
    },
  }),
}
