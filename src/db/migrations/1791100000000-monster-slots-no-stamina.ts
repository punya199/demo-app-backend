import { MigrationInterface, QueryRunner } from 'typeorm'

export class MonsterSlotsNoStamina1791100000000 implements MigrationInterface {
  name = 'MonsterSlotsNoStamina1791100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Up to MAX_LIVING_MONSTERS living monsters per owner: the one-alive unique index becomes a
    // plain lookup index, and `selected_at` marks which one the owner plays with.
    await queryRunner.query(`DROP INDEX "IDX_monsters_owner_id_alive"`)
    await queryRunner.query(
      `CREATE INDEX "IDX_monsters_owner_id_alive" ON "monsters" ("owner_id") WHERE died_at IS NULL AND deleted_at IS NULL`
    )
    await queryRunner.query(`ALTER TABLE "monsters" ADD "selected_at" TIMESTAMP WITH TIME ZONE`)

    // 2. Stamina and the stamina mini-game are gone.
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "stamina"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "last_minigame_at"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD "last_minigame_at" TIMESTAMP WITH TIME ZONE`
    )
    await queryRunner.query(`ALTER TABLE "monsters" ADD "stamina" real NOT NULL DEFAULT 100`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "selected_at"`)
    await queryRunner.query(`DROP INDEX "IDX_monsters_owner_id_alive"`)
    // Fails when an owner now has several living monsters: retire the extras before rolling back.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_monsters_owner_id_alive" ON "monsters" ("owner_id") WHERE died_at IS NULL AND deleted_at IS NULL`
    )
  }
}
