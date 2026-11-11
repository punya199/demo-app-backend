import { Column, Entity, Index } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'

export enum EnumPetListingStatus {
  ACTIVE = 'active',
  SOLD = 'sold',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

// A pet for sale on the market. The pet itself stays in `monsters` (frozen with is_listed) and
// changes owner only when bought. `fee` is the gems the market keeps from the sale (burned).
@Entity({
  name: 'pet_listings',
})
@Index('IDX_pet_listings_status_expires_at', ['status', 'expiresAt'], {
  where: 'deleted_at IS NULL',
})
@Index('IDX_pet_listings_seller_id', ['sellerId'], {
  where: 'deleted_at IS NULL',
})
@Index('IDX_pet_listings_buyer_id_sold_at', ['buyerId', 'soldAt'], {
  where: 'deleted_at IS NULL',
})
@Index('IDX_pet_listings_monster_id_active', ['monsterId'], {
  unique: true,
  where: "status = 'active' AND deleted_at IS NULL",
})
export class PetListingEntity extends BaseModelEntity {
  @Column({ name: 'seller_id', type: 'uuid' })
  sellerId: string

  @Column({ name: 'buyer_id', type: 'uuid', nullable: true })
  buyerId: string | null

  @Column({ name: 'monster_id', type: 'uuid' })
  monsterId: string

  @Column({ name: 'price', type: 'integer' })
  price: number

  @Column({ name: 'fee', type: 'integer', default: 0 })
  fee: number

  @Column({ name: 'status', type: 'varchar' })
  status: EnumPetListingStatus

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date

  @Column({ name: 'sold_at', type: 'timestamp with time zone', nullable: true })
  soldAt: Date | null
}
