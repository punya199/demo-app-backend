import { MigrationInterface, QueryRunner } from 'typeorm'

// Backstop for the one-shot ledger payouts: a battle payout (`td_battle:<battle id>`) and a stage
// first clear (`td_stage_first_clear:<stage>`) can each appear once per user. The service already
// guards both (session row lock, unique stage_progress row); this makes a double payout impossible
// even if that guard is ever bypassed. Partial on purpose: other reasons repeat (a sweep or a
// relic unlock writes one row per currency under the same reason, gacha and star-up repeat).
export class AddTdLedgerOneShotUnique1795500000001 implements MigrationInterface {
  name = 'AddTdLedgerOneShotUnique1795500000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_td_currency_ledger_oneshot_reason" ON "td"."currency_ledger" ("user_id", "reason") WHERE "reason" LIKE 'td_battle:%' OR "reason" LIKE 'td_stage_first_clear:%'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "td"."UQ_td_currency_ledger_oneshot_reason"`)
  }
}
