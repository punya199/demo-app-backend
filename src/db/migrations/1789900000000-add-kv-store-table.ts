import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddKvStoreTable1789900000000 implements MigrationInterface {
  name = 'AddKvStoreTable1789900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "kv_store" ("key" text PRIMARY KEY, "value" text NOT NULL, "expires_at" timestamptz NOT NULL)`
    )
    await queryRunner.query(`CREATE INDEX "IDX_kv_store_expires_at" ON "kv_store" ("expires_at")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_kv_store_expires_at"`)
    await queryRunner.query(`DROP TABLE "kv_store"`)
  }
}
