import { Column, Entity, Index } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'

// Category names used by the paojiao-ledger add-entry dropdown (e.g. "ขาย น้ำมัน", "มัน กุย") -
// shared across both users, unlike the old hardcoded list it replaces. Sorted alphabetically
// (Thai locale) wherever it's read, not by insertion order, so no separate sortOrder column.
@Entity({ name: 'paojiao_ledger_items' })
@Index(['name'], { unique: true, where: 'deleted_at IS NULL' })
export class LedgerItemEntity extends BaseModelEntity {
  @Column({ name: 'name', type: 'varchar', nullable: false })
  name: string
}
