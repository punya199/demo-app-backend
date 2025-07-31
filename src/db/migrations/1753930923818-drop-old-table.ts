import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropOldTable1753930923818 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "bill"`)
  }

  public async down(): Promise<void> {
    // do nothing
  }
}
