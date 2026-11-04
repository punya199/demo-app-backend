import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMonsterSkillLoadout1793793797379 implements MigrationInterface {
  name = 'AddMonsterSkillLoadout1793793797379'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" ADD "skill_loadout" jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "skill_loadout"`)
  }
}
