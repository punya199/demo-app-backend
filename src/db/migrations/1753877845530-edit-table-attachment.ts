import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditTableAttachment1753877845530 implements MigrationInterface {
  name = 'EditTableAttachment1753877845530'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_aa4cc0ec0fe4a0c13ac96a65f0"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_b4701a560b291dc8269d569d15"`)
    await queryRunner.query(
      `ALTER TABLE "attachments" RENAME COLUMN "attachableId" TO "attachable_id"`
    )
    await queryRunner.query(
      `ALTER TABLE "attachments" RENAME COLUMN "attachableType" TO "attachable_type"`
    )
    await queryRunner.query(`ALTER TABLE "attachments" RENAME COLUMN "fileName" TO "file_name"`)
    await queryRunner.query(`ALTER TABLE "attachments" RENAME COLUMN "mimeType" TO "mime_type"`)
    await queryRunner.query(`ALTER TABLE "attachments" ALTER COLUMN "size" SET NOT NULL`)
    await queryRunner.query(
      `CREATE INDEX "IDX_e0123c66a6c652c84e1209e724" ON "attachments" ("attachable_type") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_0422daf66674ad3beb6c8e999f" ON "attachments" ("attachable_id") WHERE deleted_at IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_0422daf66674ad3beb6c8e999f"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_e0123c66a6c652c84e1209e724"`)
    await queryRunner.query(`ALTER TABLE "attachments" ALTER COLUMN "size" DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE "attachments" RENAME COLUMN "mime_type" TO "mimeType"`)
    await queryRunner.query(`ALTER TABLE "attachments" RENAME COLUMN "file_name" TO "fileName"`)
    await queryRunner.query(
      `ALTER TABLE "attachments" RENAME COLUMN "attachable_type" TO "attachableType"`
    )
    await queryRunner.query(
      `ALTER TABLE "attachments" RENAME COLUMN "attachable_id" TO "attachableId"`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_b4701a560b291dc8269d569d15" ON "attachments" ("attachableId") WHERE (deleted_at IS NULL)`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_aa4cc0ec0fe4a0c13ac96a65f0" ON "attachments" ("attachableType") WHERE (deleted_at IS NULL)`
    )
  }
}
