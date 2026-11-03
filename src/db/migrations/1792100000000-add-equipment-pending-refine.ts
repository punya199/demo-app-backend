import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddEquipmentPendingRefine1792100000000 implements MigrationInterface {
  name = 'AddEquipmentPendingRefine1792100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "equipment_items" ADD "pending_refine" jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "equipment_items" DROP COLUMN "pending_refine"`)
  }
}
