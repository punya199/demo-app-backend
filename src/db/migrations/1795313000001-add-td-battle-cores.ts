import { MigrationInterface, QueryRunner } from 'typeorm'

// The equipped cores a battle was started with: [{element, rarity}] as jsonb. Null on rows from
// before this column, which replay with no cores. No personal data.
export class AddTdBattleCores1795313000001 implements MigrationInterface {
  name = 'AddTdBattleCores1795313000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "td"."battle_session" ADD "cores" jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "td"."battle_session" DROP COLUMN "cores"`)
  }
}
