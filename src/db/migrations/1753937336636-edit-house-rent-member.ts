import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditHouseRentMember1753937336636 implements MigrationInterface {
  name = 'EditHouseRentMember1753937336636'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_dffa6be0771e0b44e36aa7f70a"`)
    await queryRunner.query(`ALTER TABLE "house_rent_members" RENAME COLUMN "name" TO "user_id"`)
    await queryRunner.query(`ALTER TABLE "house_rent_members" DROP COLUMN "user_id"`)
    await queryRunner.query(`ALTER TABLE "house_rent_members" ADD "user_id" uuid NOT NULL`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6666bdb1fb3afb675ff91764d4" ON "house_rent_members" ("user_id", "house_rent_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "house_rent_members" ADD CONSTRAINT "FK_808b2525b9a2dbdc04bb0535971" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "house_rent_members" DROP CONSTRAINT "FK_808b2525b9a2dbdc04bb0535971"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_6666bdb1fb3afb675ff91764d4"`)
    await queryRunner.query(`ALTER TABLE "house_rent_members" DROP COLUMN "user_id"`)
    await queryRunner.query(
      `ALTER TABLE "house_rent_members" ADD "user_id" character varying NOT NULL`
    )
    await queryRunner.query(`ALTER TABLE "house_rent_members" RENAME COLUMN "user_id" TO "name"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dffa6be0771e0b44e36aa7f70a" ON "house_rent_members" ("name") WHERE (deleted_at IS NULL)`
    )
  }
}
