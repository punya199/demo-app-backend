import { MigrationInterface, QueryRunner } from 'typeorm'

// Skill tiers (2026-11-09) changed skill strength, and an arena PvP fight replays from its seed with
// the current skill data, so fights stored before would replay to a different result. The owner chose
// to drop them: every arena fight row is soft deleted at one fixed time so down() can bring back
// exactly these. Turn-engine rows (no arena_attacker) still replay on the old engine and stay.
// Side effect: today's attempts are counted from these rows, so players get today's PvP attempts back.
const HIDDEN_AT = '2026-11-09T00:00:00Z'

export class HidePvpReplaysBeforeSkillTiers1794228685327 implements MigrationInterface {
  name = 'HidePvpReplaysBeforeSkillTiers1794228685327'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "pvp_battles" SET "deleted_at" = $1 WHERE "deleted_at" IS NULL AND "arena_attacker" IS NOT NULL`,
      [HIDDEN_AT]
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "pvp_battles" SET "deleted_at" = NULL WHERE "deleted_at" = $1`,
      [HIDDEN_AT]
    )
  }
}
