import { MigrationInterface, QueryRunner } from 'typeorm'

// Which pet an arena defense / support unit copy came from, so it can go when that pet does.
// Older rows stay null and keep working as before.
export class AddSnapshotMonsterId1793900000000 implements MigrationInterface {
  name = 'AddSnapshotMonsterId1793900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pvp_defenses" ADD "monster_id" uuid`)
    await queryRunner.query(`ALTER TABLE "support_units" ADD "monster_id" uuid`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "support_units" DROP COLUMN "monster_id"`)
    await queryRunner.query(`ALTER TABLE "pvp_defenses" DROP COLUMN "monster_id"`)
  }
}
