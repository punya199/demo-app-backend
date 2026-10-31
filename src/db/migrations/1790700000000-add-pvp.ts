import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddPvp1790700000000 implements MigrationInterface {
  name = 'AddPvp1790700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. pvp_defenses
    await queryRunner.query(
      `CREATE TABLE "pvp_defenses" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "display_name" character varying NOT NULL, "fighter" jsonb NOT NULL, "stage" character varying NOT NULL, "species_id" character varying NOT NULL, "set_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_pvp_defenses_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_pvp_defenses_user_id" ON "pvp_defenses" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_pvp_defenses_stage" ON "pvp_defenses" ("stage") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "pvp_defenses" ADD CONSTRAINT "FK_pvp_defenses_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 2. pvp_ratings
    await queryRunner.query(
      `CREATE TABLE "pvp_ratings" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "season" character varying NOT NULL, "rating" integer NOT NULL, "wins" integer NOT NULL DEFAULT 0, "losses" integer NOT NULL DEFAULT 0, "reward_claimed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_pvp_ratings_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_pvp_ratings_rating" CHECK ("rating" >= 0))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_pvp_ratings_user_id_season" ON "pvp_ratings" ("user_id", "season") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_pvp_ratings_season_rating" ON "pvp_ratings" ("season", "rating") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "pvp_ratings" ADD CONSTRAINT "FK_pvp_ratings_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 3. pvp_battles
    await queryRunner.query(
      `CREATE TABLE "pvp_battles" (${BASE_COLUMNS}, "season" character varying NOT NULL, "attacker_id" uuid NOT NULL, "defender_id" uuid, "opponent_id" character varying NOT NULL, "attacker_name" character varying NOT NULL, "defender_name" character varying NOT NULL, "seed" integer NOT NULL, "attacker" jsonb NOT NULL, "defender" jsonb NOT NULL, "won" boolean NOT NULL, "attacker_rating_before" integer NOT NULL, "attacker_rating_after" integer NOT NULL, "defender_rating_before" integer NOT NULL, "defender_rating_after" integer, "reward" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_pvp_battles_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_pvp_battles_attacker_id_created_at" ON "pvp_battles" ("attacker_id", "created_at") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_pvp_battles_defender_id_created_at" ON "pvp_battles" ("defender_id", "created_at") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "pvp_battles" ADD CONSTRAINT "FK_pvp_battles_attacker_id" FOREIGN KEY ("attacker_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pvp_battles" DROP CONSTRAINT "FK_pvp_battles_attacker_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_pvp_battles_defender_id_created_at"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_pvp_battles_attacker_id_created_at"`)
    await queryRunner.query(`DROP TABLE "pvp_battles"`)
    await queryRunner.query(`ALTER TABLE "pvp_ratings" DROP CONSTRAINT "FK_pvp_ratings_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_pvp_ratings_season_rating"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_pvp_ratings_user_id_season"`)
    await queryRunner.query(`DROP TABLE "pvp_ratings"`)
    await queryRunner.query(`ALTER TABLE "pvp_defenses" DROP CONSTRAINT "FK_pvp_defenses_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_pvp_defenses_stage"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_pvp_defenses_user_id"`)
    await queryRunner.query(`DROP TABLE "pvp_defenses"`)
  }
}
