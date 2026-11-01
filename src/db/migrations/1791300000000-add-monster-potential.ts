import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMonsterPotential1791300000000 implements MigrationInterface {
  name = 'AddMonsterPotential1791300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Null = a monster from before potential existed: it keeps its old fixed stats.
    await queryRunner.query(`ALTER TABLE "monsters" ADD "potential" jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "potential"`)
  }
}
