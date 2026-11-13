import { MigrationInterface, QueryRunner } from 'typeorm'

// Gacha tables, all in the `td` schema. `user_id` holds the user's id by value only (no foreign
// key across schemas, no other personal data).
export class AddTdGacha1794700000000 implements MigrationInterface {
  name = 'AddTdGacha1794700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "td"."hero_owned" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "hero_id" character varying NOT NULL, "star_level" integer NOT NULL DEFAULT 1, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_hero_owned_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_td_hero_owned_user_hero" UNIQUE ("user_id", "hero_id"))`
    )
    await queryRunner.query(
      `CREATE TABLE "td"."gacha_pity" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "pity" integer NOT NULL DEFAULT 0, "last_free_pull_on" date, CONSTRAINT "PK_td_gacha_pity_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_td_gacha_pity_user_id" UNIQUE ("user_id"), CONSTRAINT "CHK_td_gacha_pity_pity" CHECK ("pity" >= 0))`
    )
    await queryRunner.query(
      `CREATE TABLE "td"."gacha_pull" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "batch_id" uuid NOT NULL, "seed" bigint NOT NULL, "pity_before" integer NOT NULL, "hero_id" character varying NOT NULL, "rarity" character varying NOT NULL, "duplicate" boolean NOT NULL, "mode" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_gacha_pull_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_td_gacha_pull_user_id" ON "td"."gacha_pull" ("user_id")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "td"."IDX_td_gacha_pull_user_id"`)
    await queryRunner.query(`DROP TABLE "td"."gacha_pull"`)
    await queryRunner.query(`DROP TABLE "td"."gacha_pity"`)
    await queryRunner.query(`DROP TABLE "td"."hero_owned"`)
  }
}
