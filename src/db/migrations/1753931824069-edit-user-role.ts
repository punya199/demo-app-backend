import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditUserRole1753931824069 implements MigrationInterface {
  name = 'EditUserRole1753931824069'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'`)
    await queryRunner.query(
      `CREATE INDEX "IDX_e688c6aa3e8b62f7cf5fbfc39c" ON "bills" ("title") WHERE deleted_at IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_e688c6aa3e8b62f7cf5fbfc39c"`)
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`)
  }
}
