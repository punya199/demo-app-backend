import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPassiveMasteriesAndAscendancy1792000000000 implements MigrationInterface {
  name = 'AddPassiveMasteriesAndAscendancy1792000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "passive_allocations" ADD "mastery_picks" jsonb NOT NULL DEFAULT '{}'`
    )
    await queryRunner.query(
      `ALTER TABLE "passive_allocations" ADD "ascendancy_path" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "passive_allocations" ADD "ascendancy_node_ids" jsonb NOT NULL DEFAULT '[]'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "passive_allocations" DROP COLUMN "ascendancy_node_ids"`)
    await queryRunner.query(`ALTER TABLE "passive_allocations" DROP COLUMN "ascendancy_path"`)
    await queryRunner.query(`ALTER TABLE "passive_allocations" DROP COLUMN "mastery_picks"`)
  }
}
