import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddColumnStatusTableUser1755385053995 implements MigrationInterface {
  name = 'AddColumnStatusTableUser1755385053995'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'inactive', 'blocked')`
    )
    await queryRunner.query(
      `ALTER TABLE "users" ADD "status" "public"."users_status_enum" NOT NULL DEFAULT 'active'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`)
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`)
  }
}
