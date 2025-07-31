import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UserRole } from '../../db/entities/user.entity'
import { jwtConstants } from './constants'

export interface PayloadUser {
  userId: string
  username: string
  role: UserRole
}
export interface Payload {
  sub: string
  username: string
  role: UserRole
}
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    })
  }

  validate(payload: Payload): PayloadUser {
    return { userId: payload.sub, username: payload.username, role: payload.role }
  }
}
