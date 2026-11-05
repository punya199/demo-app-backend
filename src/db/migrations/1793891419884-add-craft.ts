import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

// Craft queue (one unclaimed job per player) and the Catalyst pity counters. The new wallet reasons
// (craft, craft_skip) and the equipment log type (craft) are varchar values: no schema change.
export class AddCraft1793891419884 implements MigrationInterface {
  name = 'AddCraft1793891419884'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "craft_jobs" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "recipe_id" character varying NOT NULL, "use_catalyst" boolean NOT NULL DEFAULT false, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finish_at" TIMESTAMP WITH TIME ZONE NOT NULL, "claimed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_craft_jobs_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_craft_jobs_user_id_active" ON "craft_jobs" ("user_id") WHERE claimed_at IS NULL AND deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "craft_jobs" ADD CONSTRAINT "FK_craft_jobs_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    await queryRunner.query(
      `CREATE TABLE "craft_pity" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "step" character varying NOT NULL, "fails" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_craft_pity_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_craft_pity_fails" CHECK ("fails" >= 0))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_craft_pity_user_id_step" ON "craft_pity" ("user_id", "step") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "craft_pity" ADD CONSTRAINT "FK_craft_pity_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "craft_pity" DROP CONSTRAINT "FK_craft_pity_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_craft_pity_user_id_step"`)
    await queryRunner.query(`DROP TABLE "craft_pity"`)
    await queryRunner.query(`ALTER TABLE "craft_jobs" DROP CONSTRAINT "FK_craft_jobs_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_craft_jobs_user_id_active"`)
    await queryRunner.query(`DROP TABLE "craft_jobs"`)
  }
}
