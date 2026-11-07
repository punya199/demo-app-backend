import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { MonsterController } from './core/monster.controller'
import { MonsterService } from './core/monster.service'
import { FriendService } from './social/friend.service'
import { InventoryService } from './inventory/inventory.service'
import { PvpService } from './arena/pvp.service'
import { MonsterModule } from './monster.module'

const fakeDataSource = {
  options: { type: 'postgres' },
  getRepository: () => ({}),
  entityMetadatas: [],
  manager: {},
}

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: fakeDataSource }],
  exports: [DataSource],
})
class FakeDataSourceModule {}

describe('MonsterModule', () => {
  it('compiles and resolves the key providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeDataSourceModule, MonsterModule],
    }).compile()
    for (const token of [PvpService, FriendService, InventoryService, MonsterService]) {
      expect(moduleRef.get(token, { strict: false })).toBeInstanceOf(token)
    }
    expect(moduleRef.get(MonsterController, { strict: false })).toBeInstanceOf(MonsterController)
    await moduleRef.close()
  })
})
