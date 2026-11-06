import { EntityManager } from 'typeorm'

// Atomic increment: concurrent additions of the same item can't lose a count.
export const addToBag = (etm: EntityManager, userId: string, itemId: string, quantity = 1) =>
  etm.query(
    `INSERT INTO "inventory_items" ("user_id", "item_id", "quantity") VALUES ($1, $2, $3)
     ON CONFLICT ("user_id", "item_id") WHERE deleted_at IS NULL
     DO UPDATE SET "quantity" = "inventory_items"."quantity" + $3, "updated_at" = now()`,
    [userId, itemId, quantity]
  )
