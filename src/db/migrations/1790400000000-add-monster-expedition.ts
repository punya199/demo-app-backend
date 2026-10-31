import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMonsterExpedition1790400000000 implements MigrationInterface {
  name = 'AddMonsterExpedition1790400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" ADD "expedition_area_id" character varying`)
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD "expedition_minutes" integer NOT NULL DEFAULT 0`
    )
    await queryRunner.query(`ALTER TABLE "monsters" ADD "expedition_rate" real NOT NULL DEFAULT 0`)
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD "expedition_returned" boolean NOT NULL DEFAULT false`
    )
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD "last_auto_battle_at" TIMESTAMP WITH TIME ZONE`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "last_auto_battle_at"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "expedition_returned"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "expedition_rate"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "expedition_minutes"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "expedition_area_id"`)
  }
}
