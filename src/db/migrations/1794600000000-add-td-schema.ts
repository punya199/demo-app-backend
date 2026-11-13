import { MigrationInterface, QueryRunner } from 'typeorm'

// Tower Defense gets its own Postgres schema, never `public`. `user_id` columns hold the user's id
// by value only: no foreign key across schemas, no other personal data.
export class AddTdSchema1794600000000 implements MigrationInterface {
  name = 'AddTdSchema1794600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA "td"`)
    await queryRunner.query(
      `CREATE TABLE "td"."player_profile" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "energy" integer NOT NULL, "energy_updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "save_version" integer NOT NULL DEFAULT 1, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_player_profile_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_td_player_profile_user_id" UNIQUE ("user_id"), CONSTRAINT "CHK_td_player_profile_energy" CHECK ("energy" >= 0))`
    )
    await queryRunner.query(
      `CREATE TABLE "td"."currency_ledger" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "currency" character varying NOT NULL, "amount" integer NOT NULL, "reason" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_currency_ledger_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_td_currency_ledger_currency" CHECK ("currency" IN ('coins', 'gems', 'shards', 'clovers')))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_td_currency_ledger_user_id" ON "td"."currency_ledger" ("user_id")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "td"."IDX_td_currency_ledger_user_id"`)
    await queryRunner.query(`DROP TABLE "td"."currency_ledger"`)
    await queryRunner.query(`DROP TABLE "td"."player_profile"`)
    await queryRunner.query(`DROP SCHEMA "td"`)
  }
}
