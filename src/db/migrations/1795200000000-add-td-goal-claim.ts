import { MigrationInterface, QueryRunner } from 'typeorm'

// Goal, 7-day track and achievement claims in the `td` schema. `user_id` holds the user's id by
// value only (no cross-schema foreign key, no other personal data). Progress itself is derived
// from existing td rows, so this is the only new table.
export class AddTdGoalClaim1795200000000 implements MigrationInterface {
  name = 'AddTdGoalClaim1795200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "td"."goal_claim" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "claim_key" character varying(64) NOT NULL, "claimed_on" character varying(10) NOT NULL, "gems" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_goal_claim_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_td_goal_claim_user_key" UNIQUE ("user_id", "claim_key"), CONSTRAINT "CHK_td_goal_claim_gems" CHECK ("gems" > 0))`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "td"."goal_claim"`)
  }
}
