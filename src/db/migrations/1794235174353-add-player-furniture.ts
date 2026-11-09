import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

// Farm furniture: one row per player and kind with its tier (1-3). The new wallet reason
// (farm_furniture) and craft recipe ids (farm_<kind>:<tier>) are plain varchar values.
export class AddPlayerFurniture1794235174353 implements MigrationInterface {
  name = 'AddPlayerFurniture1794235174353'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "player_furniture" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "kind" character varying NOT NULL, "tier" integer NOT NULL DEFAULT 1, CONSTRAINT "PK_player_furniture_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_player_furniture_tier" CHECK ("tier" BETWEEN 1 AND 3))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_player_furniture_user_id_kind" ON "player_furniture" ("user_id", "kind") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "player_furniture" ADD CONSTRAINT "FK_player_furniture_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "player_furniture" DROP CONSTRAINT "FK_player_furniture_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_player_furniture_user_id_kind"`)
    await queryRunner.query(`DROP TABLE "player_furniture"`)
  }
}
