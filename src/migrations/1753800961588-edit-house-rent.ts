import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditHouseRent1753800961588 implements MigrationInterface {
  name = 'EditHouseRent1753800961588'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "house_rent_details" DROP CONSTRAINT "FK_979a334f70480678967e023e71f"`
    )
    await queryRunner.query(
      `ALTER TABLE "house_rent_members" DROP CONSTRAINT "FK_76a90ef27d88b2d8079abed82dc"`
    )
    await queryRunner.query(`ALTER TABLE "house_rent_details" DROP COLUMN "houseRentId"`)
    await queryRunner.query(`ALTER TABLE "house_rent_members" DROP COLUMN "houseRentId"`)
    await queryRunner.query(`ALTER TABLE "house_rents" DROP COLUMN "electricity_summary"`)
    await queryRunner.query(
      `ALTER TABLE "house_rent_details" ADD CONSTRAINT "FK_26c8799002d86a1543880a00e2e" FOREIGN KEY ("house_rent_id") REFERENCES "house_rents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "house_rent_members" ADD CONSTRAINT "FK_00188d7105eebf8b9d7a22fdb3e" FOREIGN KEY ("house_rent_id") REFERENCES "house_rents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "house_rent_members" DROP CONSTRAINT "FK_00188d7105eebf8b9d7a22fdb3e"`
    )
    await queryRunner.query(
      `ALTER TABLE "house_rent_details" DROP CONSTRAINT "FK_26c8799002d86a1543880a00e2e"`
    )
    await queryRunner.query(
      `ALTER TABLE "house_rents" ADD "electricity_summary" jsonb NOT NULL DEFAULT '{}'`
    )
    await queryRunner.query(`ALTER TABLE "house_rent_members" ADD "houseRentId" uuid`)
    await queryRunner.query(`ALTER TABLE "house_rent_details" ADD "houseRentId" uuid`)
    await queryRunner.query(
      `ALTER TABLE "house_rent_members" ADD CONSTRAINT "FK_76a90ef27d88b2d8079abed82dc" FOREIGN KEY ("houseRentId") REFERENCES "house_rents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "house_rent_details" ADD CONSTRAINT "FK_979a334f70480678967e023e71f" FOREIGN KEY ("houseRentId") REFERENCES "house_rents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }
}
