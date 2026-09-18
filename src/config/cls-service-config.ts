import { JwtModule, JwtService } from '@nestjs/jwt'
import { Request } from 'express'
import { ClsModuleAsyncOptions, ClsService } from 'nestjs-cls'
import { EnumCookieKeys } from '../modules/authentication/authentication.constant'
import { IAppJwtPayload } from '../modules/auth/auth.interface'

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
        const token = request.cookies?.[EnumCookieKeys.ACCESS_TOKEN] as string | undefined

        if (token) {
          const payload: IAppJwtPayload = jwt.decode(token)
          const userId = payload?.sub?.toString()
          if (userId) {
            cls.set('userId', userId)
          }
        }
      },
    },
  }),
}
