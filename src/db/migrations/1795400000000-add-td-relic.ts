import { MigrationInterface, QueryRunner } from 'typeorm'

// Relics in the `td` schema, plus the unlocked-relic snapshot a battle was started with.
// `user_id` holds the user's id by value only (no cross-schema foreign key, no other personal
// data). (user, relic) is unique, so a relic can only be unlocked once. The relic ids are
// validated by the app (td-sim RELICS), so adding a relic needs no migration. `battle_session.relics`
// is a jsonb list of relic ids; null on rows from before this column, which replay with none.
export class AddTdRelic1795400000000 implements MigrationInterface {
  name = 'AddTdRelic1795400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "td"."relic" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "relic_id" character varying(32) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_relic_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_td_relic_user_relic" UNIQUE ("user_id", "relic_id"))`
    )
    await queryRunner.query(`ALTER TABLE "td"."battle_session" ADD "relics" jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "td"."battle_session" DROP COLUMN "relics"`)
    await queryRunner.query(`DROP TABLE "td"."relic"`)
  }
}
