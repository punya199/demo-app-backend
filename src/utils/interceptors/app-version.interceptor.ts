import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common'
import { Response } from 'express'
import { Observable } from 'rxjs'
import appConfig from '../../config/app-config'

export class AppVersionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const res = context.switchToHttp().getResponse<Response>()
    if (appConfig.APP_VERSION) res.setHeader('X-App-Version', appConfig.APP_VERSION)
    return next.handle()
  }
}
