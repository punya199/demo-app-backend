import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddInventoryAndDailyQuests1790300000000 implements MigrationInterface {
  name = 'AddInventoryAndDailyQuests1790300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. inventory_items
    await queryRunner.query(
      `CREATE TABLE "inventory_items" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "item_id" character varying NOT NULL, "quantity" integer NOT NULL, CONSTRAINT "PK_inventory_items_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_inventory_items_quantity" CHECK ("quantity" >= 0))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_inventory_items_user_id_item_id" ON "inventory_items" ("user_id", "item_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "inventory_items" ADD CONSTRAINT "FK_inventory_items_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 2. daily_quest_progress
    await queryRunner.query(
      `CREATE TABLE "daily_quest_progress" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "quest_date" character varying NOT NULL, "quest_id" character varying NOT NULL, "progress" integer NOT NULL, "claimed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_daily_quest_progress_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_daily_quest_progress_user_id_quest_date_quest_id" ON "daily_quest_progress" ("user_id", "quest_date", "quest_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "daily_quest_progress" ADD CONSTRAINT "FK_daily_quest_progress_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_quest_progress" DROP CONSTRAINT "FK_daily_quest_progress_user_id"`
    )
    await queryRunner.query(
      `DROP INDEX "public"."IDX_daily_quest_progress_user_id_quest_date_quest_id"`
    )
    await queryRunner.query(`DROP TABLE "daily_quest_progress"`)
    await queryRunner.query(
      `ALTER TABLE "inventory_items" DROP CONSTRAINT "FK_inventory_items_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_inventory_items_user_id_item_id"`)
    await queryRunner.query(`DROP TABLE "inventory_items"`)
  }
}
