import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'
import { PayloadUser } from './jwt.strategy'

export const ReqUser = createParamDecorator((data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>()
  return request.user as PayloadUser
})
