import { MigrationInterface, QueryRunner } from 'typeorm'

// Stage progress (best stars per stage) and the stage a battle was started on, in the `td`
// schema. `user_id` holds the user's id by value only (no cross-schema foreign key, no other
// personal data). Existing battle rows are stage 1, which is the stage they were played on.
export class AddTdStageProgress1795100000000 implements MigrationInterface {
  name = 'AddTdStageProgress1795100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "td"."stage_progress" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "stage_id" integer NOT NULL, "stars" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_td_stage_progress_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_td_stage_progress_user_stage" UNIQUE ("user_id", "stage_id"), CONSTRAINT "CHK_td_stage_progress_stage" CHECK ("stage_id" >= 1), CONSTRAINT "CHK_td_stage_progress_stars" CHECK ("stars" BETWEEN 1 AND 3))`
    )
    await queryRunner.query(
      `ALTER TABLE "td"."battle_session" ADD "stage_id" integer NOT NULL DEFAULT 1`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "td"."battle_session" DROP COLUMN "stage_id"`)
    await queryRunner.query(`DROP TABLE "td"."stage_progress"`)
  }
}
