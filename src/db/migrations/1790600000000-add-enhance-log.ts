import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddEnhanceLog1790600000000 implements MigrationInterface {
  name = 'AddEnhanceLog1790600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "enhance_logs" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "equipment_id" uuid NOT NULL, "from_level" integer NOT NULL, "to_level" integer NOT NULL, "rate" real NOT NULL, "success" boolean NOT NULL, "broke" boolean NOT NULL, "cost" jsonb NOT NULL DEFAULT '{}', "pity_before" integer NOT NULL, CONSTRAINT "PK_enhance_logs_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_enhance_logs_user_id" ON "enhance_logs" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "enhance_logs" ADD CONSTRAINT "FK_enhance_logs_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "enhance_logs" DROP CONSTRAINT "FK_enhance_logs_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_enhance_logs_user_id"`)
    await queryRunner.query(`DROP TABLE "enhance_logs"`)
  }
}
