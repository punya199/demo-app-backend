import { MigrationInterface, QueryRunner } from 'typeorm'

// Furniture crafts get their own queue slot: craft_jobs.kind ('equipment' | 'furniture') and one
// unclaimed job per player and kind. Existing furniture jobs are found by their recipe id prefix, so a
// craft running at deploy time keeps running. `down` fails if a player holds one job of each kind.
export class SplitCraftJobKind1794405000000 implements MigrationInterface {
  name = 'SplitCraftJobKind1794405000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "craft_jobs" ADD "kind" character varying NOT NULL DEFAULT 'equipment'`
    )
    await queryRunner.query(
      `UPDATE "craft_jobs" SET "kind" = 'furniture' WHERE "recipe_id" LIKE 'farm\\_%'`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_craft_jobs_user_id_active"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_craft_jobs_user_id_kind_active" ON "craft_jobs" ("user_id", "kind") WHERE claimed_at IS NULL AND deleted_at IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_craft_jobs_user_id_kind_active"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_craft_jobs_user_id_active" ON "craft_jobs" ("user_id") WHERE claimed_at IS NULL AND deleted_at IS NULL`
    )
    await queryRunner.query(`ALTER TABLE "craft_jobs" DROP COLUMN "kind"`)
  }
}
