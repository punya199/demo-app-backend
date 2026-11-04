import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddArenaSnapshots1793800000000 implements MigrationInterface {
  name = 'AddArenaSnapshots1793800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pvp_defenses" ADD "arena_fighter" jsonb`)
    await queryRunner.query(`ALTER TABLE "support_units" ADD "arena_fighter" jsonb`)
    await queryRunner.query(`ALTER TABLE "pvp_battles" ADD "arena_attacker" jsonb`)
    await queryRunner.query(`ALTER TABLE "pvp_battles" ADD "arena_defender" jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pvp_battles" DROP COLUMN "arena_defender"`)
    await queryRunner.query(`ALTER TABLE "pvp_battles" DROP COLUMN "arena_attacker"`)
    await queryRunner.query(`ALTER TABLE "support_units" DROP COLUMN "arena_fighter"`)
    await queryRunner.query(`ALTER TABLE "pvp_defenses" DROP COLUMN "arena_fighter"`)
  }
}
