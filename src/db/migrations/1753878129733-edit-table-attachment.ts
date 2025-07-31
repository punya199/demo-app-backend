import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditTableAttachment1753878129733 implements MigrationInterface {
  name = 'EditTableAttachment1753878129733'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" RENAME COLUMN "url" TO "file_path"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" RENAME COLUMN "file_path" TO "url"`)
  }
}
