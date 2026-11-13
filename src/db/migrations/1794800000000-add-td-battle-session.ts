import { MigrationInterface, QueryRunner } from 'typeorm'

// Battle sessions in the `td` schema. `user_id` holds the user's id by value only (no foreign key
// across schemas, no other personal data). The seed is a uint32, so it needs bigint.
export class AddTdBattleSession1794800000000 implements MigrationInterface {
  name = 'AddTdBattleSession1794800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "td"."battle_session" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "seed" bigint NOT NULL, "status" character varying NOT NULL DEFAULT 'started', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "result" character varying, "coins_awarded" integer, "replay_hash" character varying, "finished_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_battle_session_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_td_battle_session_status" CHECK ("status" IN ('started', 'finished')))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_td_battle_session_user_id" ON "td"."battle_session" ("user_id")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "td"."IDX_td_battle_session_user_id"`)
    await queryRunner.query(`DROP TABLE "td"."battle_session"`)
  }
}
