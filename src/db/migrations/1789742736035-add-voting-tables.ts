import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddVotingTables1789742736035 implements MigrationInterface {
  name = 'AddVotingTables1789742736035'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add 'voting' to the permissions feature-name enum (same rename/recreate dance as AddPermission1758133449187).
    await queryRunner.query(`DROP INDEX "public"."IDX_b4532c45d93ae8d17fde779a30"`)
    await queryRunner.query(
      `ALTER TYPE "public"."permissions_feature_name_enum" RENAME TO "permissions_feature_name_enum_old"`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."permissions_feature_name_enum" AS ENUM('house_rent', 'bill', 'user', 'user_permissions', 'voting')`
    )
    await queryRunner.query(
      `ALTER TABLE "permissions" ALTER COLUMN "feature_name" TYPE "public"."permissions_feature_name_enum" USING "feature_name"::"text"::"public"."permissions_feature_name_enum"`
    )
    await queryRunner.query(`DROP TYPE "public"."permissions_feature_name_enum_old"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b4532c45d93ae8d17fde779a30" ON "permissions" ("user_id", "feature_name") WHERE deleted_at IS NULL`
    )

    // 2. polls
    await queryRunner.query(
      `CREATE TABLE "polls" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "title" character varying NOT NULL, "description" character varying, "slug" character varying NOT NULL, "poll_type" character varying NOT NULL, "max_selections" integer, "closes_at" TIMESTAMP WITH TIME ZONE, "closed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_polls_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_polls_slug" ON "polls" ("slug") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_polls_creator_id" ON "polls" ("creator_id") WHERE deleted_at IS NULL`
    )

    // 3. poll_options
    await queryRunner.query(
      `CREATE TABLE "poll_options" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "poll_id" uuid NOT NULL, "label" character varying NOT NULL, "order" integer NOT NULL, CONSTRAINT "PK_poll_options_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_poll_options_poll_id" ON "poll_options" ("poll_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "poll_options" ADD CONSTRAINT "FK_poll_options_poll_id" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 4. poll_votes (schema only in this migration; the voting endpoints land in a later ticket)
    await queryRunner.query(
      `CREATE TABLE "poll_votes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "poll_id" uuid NOT NULL, "voter_user_id" uuid, "voter_token" character varying, "selections" jsonb NOT NULL, CONSTRAINT "PK_poll_votes_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_poll_votes_poll_id" ON "poll_votes" ("poll_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_poll_votes_poll_id_voter_user_id" ON "poll_votes" ("poll_id", "voter_user_id") WHERE voter_user_id IS NOT NULL AND deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_poll_votes_poll_id_voter_token" ON "poll_votes" ("poll_id", "voter_token") WHERE voter_token IS NOT NULL AND deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "poll_votes" ADD CONSTRAINT "FK_poll_votes_poll_id" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "poll_votes" ADD CONSTRAINT "FK_poll_votes_voter_user_id" FOREIGN KEY ("voter_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "poll_votes" DROP CONSTRAINT "FK_poll_votes_voter_user_id"`
    )
    await queryRunner.query(`ALTER TABLE "poll_votes" DROP CONSTRAINT "FK_poll_votes_poll_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_poll_votes_poll_id_voter_token"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_poll_votes_poll_id_voter_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_poll_votes_poll_id"`)
    await queryRunner.query(`DROP TABLE "poll_votes"`)

    await queryRunner.query(`ALTER TABLE "poll_options" DROP CONSTRAINT "FK_poll_options_poll_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_poll_options_poll_id"`)
    await queryRunner.query(`DROP TABLE "poll_options"`)

    await queryRunner.query(`DROP INDEX "public"."IDX_polls_creator_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_polls_slug"`)
    await queryRunner.query(`DROP TABLE "polls"`)

    await queryRunner.query(`DROP INDEX "public"."IDX_b4532c45d93ae8d17fde779a30"`)
    await queryRunner.query(
      `ALTER TYPE "public"."permissions_feature_name_enum" RENAME TO "permissions_feature_name_enum_old"`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."permissions_feature_name_enum" AS ENUM('house_rent', 'bill', 'user', 'user_permissions')`
    )
    await queryRunner.query(
      `ALTER TABLE "permissions" ALTER COLUMN "feature_name" TYPE "public"."permissions_feature_name_enum" USING "feature_name"::"text"::"public"."permissions_feature_name_enum"`
    )
    await queryRunner.query(`DROP TYPE "public"."permissions_feature_name_enum_old"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b4532c45d93ae8d17fde779a30" ON "permissions" ("user_id", "feature_name") WHERE deleted_at IS NULL`
    )
  }
}
