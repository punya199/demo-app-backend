import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMonsterNickname1791500000000 implements MigrationInterface {
  name = 'AddMonsterNickname1791500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" ADD "nickname" character varying(16)`)
    await queryRunner.query(`ALTER TABLE "monsters" ADD "last_renamed_at" TIMESTAMP WITH TIME ZONE`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "last_renamed_at"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "nickname"`)
  }
}
