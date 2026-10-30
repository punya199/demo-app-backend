import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddMonsterEconomyTables1790100000000 implements MigrationInterface {
  name = 'AddMonsterEconomyTables1790100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. wallets
    await queryRunner.query(
      `CREATE TABLE "wallets" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "coin" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_wallets_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wallets_user_id" ON "wallets" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "FK_wallets_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 2. wallet_transactions
    await queryRunner.query(
      `CREATE TABLE "wallet_transactions" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "currency" character varying NOT NULL, "amount" integer NOT NULL, "balance_after" integer NOT NULL, "reason" character varying NOT NULL, "ref_id" character varying, CONSTRAINT "PK_wallet_transactions_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_user_id" ON "wallet_transactions" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" ADD CONSTRAINT "FK_wallet_transactions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 3. adventure_progress
    await queryRunner.query(
      `CREATE TABLE "adventure_progress" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "stage_id" character varying NOT NULL, "clear_count" integer NOT NULL, "first_cleared_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_adventure_progress_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_adventure_progress_user_id_stage_id" ON "adventure_progress" ("user_id", "stage_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "adventure_progress" ADD CONSTRAINT "FK_adventure_progress_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 4. monster_dex
    await queryRunner.query(
      `CREATE TABLE "monster_dex" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "species_id" character varying NOT NULL, "first_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_monster_dex_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_monster_dex_user_id_species_id" ON "monster_dex" ("user_id", "species_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "monster_dex" ADD CONSTRAINT "FK_monster_dex_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 5. Backfill the Dex from monsters raised before it existed: every form an evolve log
    // reached, plus each monster's current form (covers rows with no logs). Eggs are not entries.
    await queryRunner.query(`
      INSERT INTO "monster_dex" ("user_id", "species_id", "first_seen_at")
      SELECT "user_id", "species_id", MIN("seen_at")
      FROM (
        SELECT m."owner_id" AS "user_id", l."payload"->>'to' AS "species_id", l."created_at" AS "seen_at"
        FROM "monster_logs" l
        JOIN "monsters" m ON m."id" = l."monster_id"
        WHERE l."type" = 'evolve' AND l."deleted_at" IS NULL AND m."deleted_at" IS NULL
        UNION ALL
        SELECT "owner_id", "species_id", "updated_at"
        FROM "monsters"
        WHERE "stage" <> 'egg' AND "deleted_at" IS NULL
      ) seen
      WHERE "species_id" NOT LIKE '%\\_egg'
      GROUP BY "user_id", "species_id"
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monster_dex" DROP CONSTRAINT "FK_monster_dex_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_monster_dex_user_id_species_id"`)
    await queryRunner.query(`DROP TABLE "monster_dex"`)
    await queryRunner.query(
      `ALTER TABLE "adventure_progress" DROP CONSTRAINT "FK_adventure_progress_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_adventure_progress_user_id_stage_id"`)
    await queryRunner.query(`DROP TABLE "adventure_progress"`)
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_wallet_transactions_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_wallet_transactions_user_id"`)
    await queryRunner.query(`DROP TABLE "wallet_transactions"`)
    await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT "FK_wallets_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_wallets_user_id"`)
    await queryRunner.query(`DROP TABLE "wallets"`)
  }
}
