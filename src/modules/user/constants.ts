import appConfig from '../../config/app-config'

export const jwtConstants = {
  secret: appConfig.JWT_SECRET,
  expiresIn: appConfig.JWT_EXPIRES_IN,
}
