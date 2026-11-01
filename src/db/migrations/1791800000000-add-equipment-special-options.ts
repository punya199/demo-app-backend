import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddEquipmentSpecialOptions1791800000000 implements MigrationInterface {
  name = 'AddEquipmentSpecialOptions1791800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing pieces keep an empty list: no special option, nothing else changes for them.
    await queryRunner.query(
      `ALTER TABLE "equipment_items" ADD "special_options" jsonb NOT NULL DEFAULT '[]'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "equipment_items" DROP COLUMN "special_options"`)
  }
}
