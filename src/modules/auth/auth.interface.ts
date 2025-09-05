import { UserRole } from '../../db/entities/user.entity'
import { IBaseTokenPayload } from '../authentication/authentication.service'

export interface IAppJwtPayload extends IBaseTokenPayload {
  sub: string
  username: string
  role: UserRole
}
