import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddPassiveTree1791200000000 implements MigrationInterface {
  name = 'AddPassiveTree1791200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "passive_allocations" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "node_ids" jsonb NOT NULL DEFAULT '[]', "refunded_points" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_passive_allocations_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_passive_allocations_user_id" ON "passive_allocations" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "passive_allocations" ADD CONSTRAINT "FK_passive_allocations_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "passive_allocations" DROP CONSTRAINT "FK_passive_allocations_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_passive_allocations_user_id"`)
    await queryRunner.query(`DROP TABLE "passive_allocations"`)
  }
}
