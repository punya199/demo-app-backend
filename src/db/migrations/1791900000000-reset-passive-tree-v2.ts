import { MigrationInterface, QueryRunner } from 'typeorm'

// Passive tree v2 uses a new node id set (`v2-...`), so every old allocation is cleared and the
// points come back with it, free. refunded_points goes to 0 so the free refunds start fresh.
export class ResetPassiveTreeV21791900000000 implements MigrationInterface {
  name = 'ResetPassiveTreeV21791900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "passive_allocations" SET "node_ids" = '[]'::jsonb, "refunded_points" = 0 WHERE "deleted_at" IS NULL`
    )
  }

  public async down(): Promise<void> {
    // The old allocations are gone; nothing to restore.
  }
}
