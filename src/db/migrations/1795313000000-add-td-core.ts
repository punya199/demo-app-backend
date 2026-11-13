import { MigrationInterface, QueryRunner } from 'typeorm'

// Cores in the `td` schema. `user_id` holds the user's id by value only (no cross-schema foreign
// key, no other personal data). A slot holds at most one core, and (user, source) is unique so a
// first-clear grant can only happen once.
export class AddTdCore1795313000000 implements MigrationInterface {
  name = 'AddTdCore1795313000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "td"."core" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "element" character varying(16) NOT NULL, "rarity" character varying(16) NOT NULL, "slot" integer, "source" character varying(32) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_core_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_td_core_user_source" UNIQUE ("user_id", "source"), CONSTRAINT "CHK_td_core_element" CHECK ("element" IN ('fire', 'ice', 'nature', 'physical')), CONSTRAINT "CHK_td_core_rarity" CHECK ("rarity" IN ('common', 'rare', 'epic', 'legendary')), CONSTRAINT "CHK_td_core_slot" CHECK ("slot" IS NULL OR ("slot" >= 0 AND "slot" <= 3)))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_td_core_user_slot" ON "td"."core" ("user_id", "slot") WHERE "slot" IS NOT NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "td"."UQ_td_core_user_slot"`)
    await queryRunner.query(`DROP TABLE "td"."core"`)
  }
}
