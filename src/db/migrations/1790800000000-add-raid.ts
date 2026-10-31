import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddRaid1790800000000 implements MigrationInterface {
  name = 'AddRaid1790800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Raid tokens, the third wallet currency.
    await queryRunner.query(`ALTER TABLE "wallets" ADD "raid_token" integer NOT NULL DEFAULT 0`)
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "CHK_wallets_raid_token" CHECK ("raid_token" >= 0)`
    )

    // 2. raid_progress: which boss/difficulty a user has cleared (unlocks the next difficulty and
    // the Boss Token exchange of that difficulty's grade).
    await queryRunner.query(
      `CREATE TABLE "raid_progress" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "boss_id" character varying NOT NULL, "difficulty" character varying NOT NULL, "clear_count" integer NOT NULL, "first_cleared_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_raid_progress_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_raid_progress_user_id_boss_id_difficulty" ON "raid_progress" ("user_id", "boss_id", "difficulty") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "raid_progress" ADD CONSTRAINT "FK_raid_progress_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "raid_progress" DROP CONSTRAINT "FK_raid_progress_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_raid_progress_user_id_boss_id_difficulty"`)
    await queryRunner.query(`DROP TABLE "raid_progress"`)
    await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT "CHK_wallets_raid_token"`)
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "raid_token"`)
  }
}
