import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// Per user, not per monster: bought items wait here until the player uses one. Change `quantity`
// only through InventoryService so the count can't go negative under concurrent requests.
@Entity({
  name: 'inventory_items',
})
@Index('IDX_inventory_items_user_id_item_id', ['userId', 'itemId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class InventoryItemEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // Item id from src/modules/monster/shop-data.ts
  @Column({ name: 'item_id', type: 'varchar' })
  itemId: string

  @Column({ name: 'quantity', type: 'integer' })
  quantity: number

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_inventory_items_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
