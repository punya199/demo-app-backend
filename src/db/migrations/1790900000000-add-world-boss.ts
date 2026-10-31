import { MigrationInterface, QueryRunner } from 'typeorm'

const BASE_COLUMNS = `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid`

export class AddWorldBoss1790900000000 implements MigrationInterface {
  name = 'AddWorldBoss1790900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. world_bosses: one shared boss per Thai ISO week
    await queryRunner.query(
      `CREATE TABLE "world_bosses" (${BASE_COLUMNS}, "week" character varying NOT NULL, "boss_id" character varying NOT NULL, "max_hp" integer NOT NULL, "hp" integer NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "defeated_at" TIMESTAMP WITH TIME ZONE, "killed_by_user_id" uuid, CONSTRAINT "PK_world_bosses_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_world_bosses_hp" CHECK ("hp" >= 0 AND "hp" <= "max_hp"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_world_bosses_week" ON "world_bosses" ("week") WHERE deleted_at IS NULL`
    )

    // 2. world_boss_damage: each player's share
    await queryRunner.query(
      `CREATE TABLE "world_boss_damage" (${BASE_COLUMNS}, "world_boss_id" uuid NOT NULL, "user_id" uuid NOT NULL, "damage" integer NOT NULL DEFAULT 0, "hits" integer NOT NULL DEFAULT 0, "reward_claimed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_world_boss_damage_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_world_boss_damage_damage" CHECK ("damage" >= 0))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_world_boss_damage_world_boss_id_user_id" ON "world_boss_damage" ("world_boss_id", "user_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_world_boss_damage_world_boss_id_damage" ON "world_boss_damage" ("world_boss_id", "damage") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "world_boss_damage" ADD CONSTRAINT "FK_world_boss_damage_world_boss_id" FOREIGN KEY ("world_boss_id") REFERENCES "world_bosses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "world_boss_damage" ADD CONSTRAINT "FK_world_boss_damage_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "world_boss_damage" DROP CONSTRAINT "FK_world_boss_damage_user_id"`
    )
    await queryRunner.query(
      `ALTER TABLE "world_boss_damage" DROP CONSTRAINT "FK_world_boss_damage_world_boss_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_world_boss_damage_world_boss_id_damage"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_world_boss_damage_world_boss_id_user_id"`)
    await queryRunner.query(`DROP TABLE "world_boss_damage"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_world_bosses_week"`)
    await queryRunner.query(`DROP TABLE "world_bosses"`)
  }
}
