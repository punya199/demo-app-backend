import { MigrationInterface, QueryRunner } from 'typeorm'

// The hero pool a battle was started with: [{hero, star}] as jsonb. Null on rows from before this
// column, which replay with the starter pool. No personal data.
export class AddTdBattleHeroPool1794900000000 implements MigrationInterface {
  name = 'AddTdBattleHeroPool1794900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "td"."battle_session" ADD "hero_pool" jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "td"."battle_session" DROP COLUMN "hero_pool"`)
  }
}
