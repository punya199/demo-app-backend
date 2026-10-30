import { MigrationInterface, QueryRunner } from 'typeorm'

export class MonsterStaminaAndGems1790200000000 implements MigrationInterface {
  name = 'MonsterStaminaAndGems1790200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. The sleep / lights system is gone.
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "lights_on"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "sleep_light_minutes"`)

    // 2. Stamina, online presence and the mini-game cooldown. Existing monsters start full.
    await queryRunner.query(`ALTER TABLE "monsters" ADD "stamina" real NOT NULL DEFAULT 100`)
    await queryRunner.query(`ALTER TABLE "monsters" ADD "last_seen_at" TIMESTAMP WITH TIME ZONE`)
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD "last_minigame_at" TIMESTAMP WITH TIME ZONE`
    )

    // 3. Stage durations got much shorter. Evolution fires when progress crosses the duration,
    // so cap living monsters just below the new duration - they evolve on their next minute
    // instead of being stuck past a threshold they can no longer cross.
    await queryRunner.query(`
      UPDATE "monsters" SET "stage_minutes" = LEAST("stage_minutes", CASE "stage"
        WHEN 'egg' THEN 1
        WHEN 'baby_1' THEN 14
        WHEN 'baby_2' THEN 89
        WHEN 'adult' THEN 359
        WHEN 'perfect' THEN 719
        ELSE "stage_minutes"
      END)
      WHERE "died_at" IS NULL AND "deleted_at" IS NULL
    `)

    // 4. Gems, the second wallet currency.
    await queryRunner.query(`ALTER TABLE "wallets" ADD "gem" integer NOT NULL DEFAULT 0`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "gem"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "last_minigame_at"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "last_seen_at"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "stamina"`)
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD "sleep_light_minutes" integer NOT NULL DEFAULT 0`
    )
    await queryRunner.query(`ALTER TABLE "monsters" ADD "lights_on" boolean NOT NULL DEFAULT true`)
  }
}
