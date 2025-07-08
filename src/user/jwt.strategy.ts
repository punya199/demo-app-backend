import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { jwtConstants } from './constants'

export interface PayloadUser {
  userId: number
  username: string
}
export interface Payload {
  sub: number
  username: string
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
    return { userId: payload.sub, username: payload.username }
  }
}
