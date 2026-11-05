import { MigrationInterface, QueryRunner } from 'typeorm'

// Skip replaced auto-battle: everyone starts the adventure again from the first stage, and
// first-clear rewards pay out again (they are decided by the live progress rows). Rows are soft
// deleted at one fixed time so down() can bring back exactly these.
const RESET_AT = '2026-11-05T00:00:00Z'

export class ResetAdventureProgress1793845949518 implements MigrationInterface {
  name = 'ResetAdventureProgress1793845949518'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "adventure_progress" SET "deleted_at" = $1 WHERE "deleted_at" IS NULL`,
      [RESET_AT]
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Clears made after the reset are dropped in favour of the progress from before it.
    await queryRunner.query(
      `UPDATE "adventure_progress" SET "deleted_at" = now() WHERE "deleted_at" IS NULL`
    )
    await queryRunner.query(
      `UPDATE "adventure_progress" SET "deleted_at" = NULL WHERE "deleted_at" = $1`,
      [RESET_AT]
    )
  }
}
