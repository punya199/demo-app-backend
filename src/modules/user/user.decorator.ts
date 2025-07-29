import { applyDecorators, createParamDecorator, ExecutionContext, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PayloadUser } from './jwt.strategy'

export const ReqUser = createParamDecorator((data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>()
  return request.user as PayloadUser
})

export const AuthUser = () => applyDecorators(UseGuards(JwtAuthGuard))
