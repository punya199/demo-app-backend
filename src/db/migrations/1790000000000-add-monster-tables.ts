import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMonsterTables1790000000000 implements MigrationInterface {
  name = 'AddMonsterTables1790000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "monsters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "owner_id" uuid NOT NULL, "line" character varying NOT NULL, "species_id" character varying NOT NULL, "stage" character varying NOT NULL, "fullness" real NOT NULL, "strength" real NOT NULL, "weight" integer NOT NULL, "poops" integer NOT NULL, "is_sick" boolean NOT NULL, "lights_on" boolean NOT NULL, "care_mistakes" integer NOT NULL, "train_count" integer NOT NULL, "wins" integer NOT NULL DEFAULT 0, "losses" integer NOT NULL DEFAULT 0, "poop_minutes" integer NOT NULL, "hungry_minutes" integer NOT NULL, "weak_minutes" integer NOT NULL, "sick_minutes" integer NOT NULL, "sleep_light_minutes" integer NOT NULL, "stage_minutes" integer NOT NULL, "age_minutes" integer NOT NULL, "born_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_tick_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_trained_at" TIMESTAMP WITH TIME ZONE, "died_at" TIMESTAMP WITH TIME ZONE, "death_cause" character varying, CONSTRAINT "PK_monsters_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_monsters_owner_id_alive" ON "monsters" ("owner_id") WHERE died_at IS NULL AND deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_monsters_owner_id_born_at" ON "monsters" ("owner_id", "born_at") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD CONSTRAINT "FK_monsters_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )

    await queryRunner.query(
      `CREATE TABLE "monster_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "monster_id" uuid NOT NULL, "type" character varying NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_monster_logs_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_monster_logs_monster_id" ON "monster_logs" ("monster_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "monster_logs" ADD CONSTRAINT "FK_monster_logs_monster_id" FOREIGN KEY ("monster_id") REFERENCES "monsters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "monster_logs" DROP CONSTRAINT "FK_monster_logs_monster_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_monster_logs_monster_id"`)
    await queryRunner.query(`DROP TABLE "monster_logs"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP CONSTRAINT "FK_monsters_owner_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_monsters_owner_id_born_at"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_monsters_owner_id_alive"`)
    await queryRunner.query(`DROP TABLE "monsters"`)
  }
}
