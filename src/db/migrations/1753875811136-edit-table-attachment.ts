import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditTableAttachment1753875811136 implements MigrationInterface {
  name = 'EditTableAttachment1753875811136'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" ALTER COLUMN "attachableId" DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE "attachments" ALTER COLUMN "attachableType" DROP NOT NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" ALTER COLUMN "attachableType" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "attachments" ALTER COLUMN "attachableId" SET NOT NULL`)
  }
}
