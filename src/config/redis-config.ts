import { RedisModuleOptions } from '@nestjs-modules/ioredis'
import appConfig from './app-config'

export const redisConfig: RedisModuleOptions = {
  type: 'single',
  options: {
    host: appConfig.REDIS_HOST,
    port: appConfig.REDIS_PORT,
    keyPrefix: appConfig.REDIS_PREFIX,
  },
}
