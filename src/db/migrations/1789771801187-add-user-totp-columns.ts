import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddUserTotpColumns1789771801187 implements MigrationInterface {
  name = 'AddUserTotpColumns1789771801187'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "two_factor_enabled" boolean NOT NULL DEFAULT false`
    )
    await queryRunner.query(`ALTER TABLE "users" ADD "two_factor_secret" character varying`)
    await queryRunner.query(`ALTER TABLE "users" ADD "backup_codes" jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "backup_codes"`)
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "two_factor_secret"`)
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "two_factor_enabled"`)
  }
}
