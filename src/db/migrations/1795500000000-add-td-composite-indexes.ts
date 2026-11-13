import { MigrationInterface, QueryRunner } from 'typeorm'

// Composite indexes for the td read paths that filter by user plus a second column:
// the ledger balance (user, currency) and daily counts (user, created_at), the won-battle daily
// goal (user, finished_at) and the daily pull goal (user, created_at). Indexes only: no data
// changes. The single-column user_id indexes stay (they are small, and other queries use them).
export class AddTdCompositeIndexes1795500000000 implements MigrationInterface {
  name = 'AddTdCompositeIndexes1795500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_td_currency_ledger_user_currency" ON "td"."currency_ledger" ("user_id", "currency") INCLUDE ("amount")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_td_currency_ledger_user_created_at" ON "td"."currency_ledger" ("user_id", "created_at")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_td_battle_session_user_finished_at" ON "td"."battle_session" ("user_id", "finished_at")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_td_gacha_pull_user_created_at" ON "td"."gacha_pull" ("user_id", "created_at")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "td"."IDX_td_gacha_pull_user_created_at"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "td"."IDX_td_battle_session_user_finished_at"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "td"."IDX_td_currency_ledger_user_created_at"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "td"."IDX_td_currency_ledger_user_currency"`)
  }
}
