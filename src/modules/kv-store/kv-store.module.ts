import { Global, Module } from '@nestjs/common'
import { KvStore } from './kv-store'
import { PostgresKvStore } from './postgres-kv-store'

@Global()
@Module({
  providers: [{ provide: KvStore, useClass: PostgresKvStore }],
  exports: [KvStore],
})
export class KvStoreModule {}
