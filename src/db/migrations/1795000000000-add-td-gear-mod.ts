import { MigrationInterface, QueryRunner } from 'typeorm'

// Per-hero gear mod level, in the `td` schema. `user_id` holds the user's id by value only (no
// foreign key across schemas, no other personal data). No row means level 0.
export class AddTdGearMod1795000000000 implements MigrationInterface {
  name = 'AddTdGearMod1795000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "td"."gear_mod" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "hero_id" character varying NOT NULL, "level" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_gear_mod_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_td_gear_mod_user_hero" UNIQUE ("user_id", "hero_id"), CONSTRAINT "CHK_td_gear_mod_level" CHECK ("level" >= 0))`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "td"."gear_mod"`)
  }
}
