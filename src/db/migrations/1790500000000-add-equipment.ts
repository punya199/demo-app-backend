import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddEquipment1790500000000 implements MigrationInterface {
  name = 'AddEquipment1790500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. equipment_items
    await queryRunner.query(
      `CREATE TABLE "equipment_items" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "template_id" character varying NOT NULL, "slot" character varying NOT NULL, "set_id" character varying, "grade" character varying NOT NULL, "main_value" integer NOT NULL, "sub_stats" jsonb NOT NULL DEFAULT '{}', "enhance_level" integer NOT NULL DEFAULT 0, "pity" integer NOT NULL DEFAULT 0, "equipped" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_equipment_items_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_equipment_items_enhance_level" CHECK ("enhance_level" BETWEEN 0 AND 15))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_equipment_items_user_id" ON "equipment_items" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_equipment_items_user_id_slot_equipped" ON "equipment_items" ("user_id", "slot") WHERE equipped AND deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "equipment_items" ADD CONSTRAINT "FK_equipment_items_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 2. equipment_logs
    await queryRunner.query(
      `CREATE TABLE "equipment_logs" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "equipment_id" uuid, "type" character varying NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_equipment_logs_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_equipment_logs_user_id" ON "equipment_logs" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "equipment_logs" ADD CONSTRAINT "FK_equipment_logs_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equipment_logs" DROP CONSTRAINT "FK_equipment_logs_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_equipment_logs_user_id"`)
    await queryRunner.query(`DROP TABLE "equipment_logs"`)
    await queryRunner.query(
      `ALTER TABLE "equipment_items" DROP CONSTRAINT "FK_equipment_items_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_equipment_items_user_id_slot_equipped"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_equipment_items_user_id"`)
    await queryRunner.query(`DROP TABLE "equipment_items"`)
  }
}
