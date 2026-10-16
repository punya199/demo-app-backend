import { InjectRedis } from '@nestjs-modules/ioredis'
import { Injectable } from '@nestjs/common'
import Redis from 'ioredis'
import { KvStore } from './kv-store'

@Injectable()
export class RedisKvStore extends KvStore {
  constructor(@InjectRedis() private readonly redis: Redis) {
    super()
  }

  get(key: string) {
    return this.redis.get(key)
  }

  async set(key: string, value: string, ttlMs: number) {
    await this.redis.set(key, value, 'PX', ttlMs)
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    return (await this.redis.set(key, value, 'PX', ttlMs, 'NX')) === 'OK'
  }

  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys)
  }

  // INCR auto-initializes to 1; the TTL is only set on that first increment.
  async incrementWithTtl(key: string, ttlMs: number) {
    const count = await this.redis.incr(key)
    if (count === 1) await this.redis.pexpire(key, ttlMs)
    return count
  }

  // ioredis applies keyPrefix to key args but not to SCAN MATCH, and SCAN returns prefixed keys.
  async deleteByPrefix(prefix: string) {
    const keyPrefix = this.redis.options.keyPrefix ?? ''
    const keys: string[] = []
    for await (const batch of this.redis.scanStream({ match: `${keyPrefix}${prefix}*` })) {
      keys.push(...(batch as string[]))
    }
    await this.del(...keys.map(key => key.slice(keyPrefix.length)))
  }
}
