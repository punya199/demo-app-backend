import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditUser1753932097914 implements MigrationInterface {
  name = 'EditUser1753932097914'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_2468430a98f867cfb7ce0cb9a5" ON "users" ("password") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_4d8f2aa148e7b656e3539ba8d4" ON "users" ("role") WHERE deleted_at IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_4d8f2aa148e7b656e3539ba8d4"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_2468430a98f867cfb7ce0cb9a5"`)
  }
}
