import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddSocial1791000000000 implements MigrationInterface {
  name = 'AddSocial1791000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. player_profiles, with the arena names players already chose
    await queryRunner.query(
      `CREATE TABLE "player_profiles" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "display_name" character varying NOT NULL, "friend_code" character varying NOT NULL, CONSTRAINT "PK_player_profiles_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_player_profiles_user_id" ON "player_profiles" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_player_profiles_friend_code" ON "player_profiles" ("friend_code") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "player_profiles" ADD CONSTRAINT "FK_player_profiles_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
    // Players who already have an arena defense keep their name. Their code comes from a hash with
    // the look-alike characters swapped out; a (very unlikely) collision just skips that row, and
    // the profile is created on first use.
    await queryRunner.query(`
      INSERT INTO "player_profiles" ("user_id", "display_name", "friend_code")
      SELECT d."user_id", d."display_name",
             translate(upper(substr(md5(d."user_id"::text || clock_timestamp()::text), 1, 8)), '01OIL', '23XYZ')
      FROM "pvp_defenses" d WHERE d."deleted_at" IS NULL
      ON CONFLICT DO NOTHING
    `)
    await queryRunner.query(`ALTER TABLE "pvp_defenses" DROP COLUMN "display_name"`)

    // 2. friendships (one row per pair, smaller id first)
    await queryRunner.query(
      `CREATE TABLE "friendships" (${BASE_COLUMNS}, "user_low" uuid NOT NULL, "user_high" uuid NOT NULL, "requested_by" uuid NOT NULL, "status" character varying NOT NULL, "points" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_friendships_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_friendships_pair_order" CHECK ("user_low" < "user_high"), CONSTRAINT "CHK_friendships_requested_by" CHECK ("requested_by" IN ("user_low", "user_high")))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_friendships_user_low_user_high" ON "friendships" ("user_low", "user_high") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_friendships_user_high" ON "friendships" ("user_high") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "friendships" ADD CONSTRAINT "FK_friendships_user_low" FOREIGN KEY ("user_low") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "friendships" ADD CONSTRAINT "FK_friendships_user_high" FOREIGN KEY ("user_high") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 3. friend_interactions (greetings and gifts)
    await queryRunner.query(
      `CREATE TABLE "friend_interactions" (${BASE_COLUMNS}, "friendship_id" uuid NOT NULL, "actor_id" uuid NOT NULL, "kind" character varying NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_friend_interactions_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_friend_interactions_actor_id_created_at" ON "friend_interactions" ("actor_id", "created_at") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "friend_interactions" ADD CONSTRAINT "FK_friend_interactions_friendship_id" FOREIGN KEY ("friendship_id") REFERENCES "friendships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 4. support_units (what a player offers for rent)
    await queryRunner.query(
      `CREATE TABLE "support_units" (${BASE_COLUMNS}, "user_id" uuid NOT NULL, "fighter" jsonb NOT NULL, "stage" character varying NOT NULL, "set_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_support_units_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_support_units_user_id" ON "support_units" ("user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "support_units" ADD CONSTRAINT "FK_support_units_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    // 5. rentals (income cap and the ally's share of boss damage)
    await queryRunner.query(
      `CREATE TABLE "rentals" (${BASE_COLUMNS}, "renter_id" uuid NOT NULL, "owner_id" uuid NOT NULL, "support_unit_id" uuid NOT NULL, "world_boss_id" uuid NOT NULL, "fee" integer NOT NULL, "ally_damage" integer NOT NULL, CONSTRAINT "PK_rentals_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_rentals_fee" CHECK ("fee" >= 0))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_rentals_owner_id_created_at" ON "rentals" ("owner_id", "created_at") WHERE deleted_at IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_rentals_owner_id_created_at"`)
    await queryRunner.query(`DROP TABLE "rentals"`)
    await queryRunner.query(
      `ALTER TABLE "support_units" DROP CONSTRAINT "FK_support_units_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_support_units_user_id"`)
    await queryRunner.query(`DROP TABLE "support_units"`)
    await queryRunner.query(
      `ALTER TABLE "friend_interactions" DROP CONSTRAINT "FK_friend_interactions_friendship_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_friend_interactions_actor_id_created_at"`)
    await queryRunner.query(`DROP TABLE "friend_interactions"`)
    await queryRunner.query(`ALTER TABLE "friendships" DROP CONSTRAINT "FK_friendships_user_high"`)
    await queryRunner.query(`ALTER TABLE "friendships" DROP CONSTRAINT "FK_friendships_user_low"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_friendships_user_high"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_friendships_user_low_user_high"`)
    await queryRunner.query(`DROP TABLE "friendships"`)
    // Put the arena name back where PvP stored it before.
    await queryRunner.query(`ALTER TABLE "pvp_defenses" ADD "display_name" character varying`)
    await queryRunner.query(`
      UPDATE "pvp_defenses" d SET "display_name" = p."display_name"
      FROM "player_profiles" p WHERE p."user_id" = d."user_id" AND p."deleted_at" IS NULL
    `)
    await queryRunner.query(
      `UPDATE "pvp_defenses" SET "display_name" = 'ผู้ฝึก' WHERE "display_name" IS NULL`
    )
    await queryRunner.query(`ALTER TABLE "pvp_defenses" ALTER COLUMN "display_name" SET NOT NULL`)
    await queryRunner.query(
      `ALTER TABLE "player_profiles" DROP CONSTRAINT "FK_player_profiles_user_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_player_profiles_friend_code"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_player_profiles_user_id"`)
    await queryRunner.query(`DROP TABLE "player_profiles"`)
  }
}
