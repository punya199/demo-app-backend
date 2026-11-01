import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddCostumes1791600000000 implements MigrationInterface {
  name = 'AddCostumes1791600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "player_costumes" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "costume_id" character varying NOT NULL, CONSTRAINT "PK_player_costumes_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_player_costumes_user_id_costume_id" ON "player_costumes" ("user_id", "costume_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "player_costumes" ADD CONSTRAINT "FK_player_costumes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
    await queryRunner.query(`ALTER TABLE "monsters" ADD "costume" jsonb NOT NULL DEFAULT '{}'`)
    await queryRunner.query(
      `ALTER TABLE "player_profiles" ADD "show_costume" boolean NOT NULL DEFAULT true`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "player_profiles" DROP COLUMN "show_costume"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "costume"`)
    await queryRunner.query(
      `ALTER TABLE "player_costumes" DROP CONSTRAINT "FK_player_costumes_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_player_costumes_user_id_costume_id"`)
    await queryRunner.query(`DROP TABLE "player_costumes"`)
  }
}
