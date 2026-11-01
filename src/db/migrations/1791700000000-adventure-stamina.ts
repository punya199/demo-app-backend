import { MigrationInterface, QueryRunner } from 'typeorm'

export class AdventureStamina1791700000000 implements MigrationInterface {
  name = 'AdventureStamina1791700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Stamina is back, per monster and for adventure fights only. Every monster starts full.
    await queryRunner.query(`ALTER TABLE "monsters" ADD "stamina" real NOT NULL DEFAULT 100`)
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD "last_minigame_at" TIMESTAMP WITH TIME ZONE`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "last_minigame_at"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "stamina"`)
  }
}
