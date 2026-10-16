import { Global, Module } from '@nestjs/common'
import { KvStore } from './kv-store'
import { RedisKvStore } from './redis-kv-store'

@Global()
@Module({
  providers: [{ provide: KvStore, useClass: RedisKvStore }],
  exports: [KvStore],
})
export class KvStoreModule {}
