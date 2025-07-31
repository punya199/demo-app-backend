import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditColumnRoleTableUser1753985662185 implements MigrationInterface {
  name = 'EditColumnRoleTableUser1753985662185'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_4d8f2aa148e7b656e3539ba8d4"`)
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`)
    await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin')`)
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_4d8f2aa148e7b656e3539ba8d4" ON "users" ("role") WHERE deleted_at IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_4d8f2aa148e7b656e3539ba8d4"`)
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`)
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`)
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" character varying NOT NULL DEFAULT 'user'`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_4d8f2aa148e7b656e3539ba8d4" ON "users" ("role") WHERE (deleted_at IS NULL)`
    )
  }
}
