import { MigrationInterface, QueryRunner } from 'typeorm'

export class EditHouseRent1753791762186 implements MigrationInterface {
  name = 'EditHouseRent1753791762186'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "house_rent_details" DROP COLUMN "house_rent_price"`)
    await queryRunner.query(
      `ALTER TABLE "house_rent_details" ADD "house_rent_price" numeric(10,2) NOT NULL DEFAULT '0'`
    )
    await queryRunner.query(`ALTER TABLE "house_rent_details" DROP COLUMN "water_price"`)
    await queryRunner.query(
      `ALTER TABLE "house_rent_details" ADD "water_price" numeric(10,2) NOT NULL DEFAULT '0'`
    )
    await queryRunner.query(`ALTER TABLE "house_rents" DROP COLUMN "base_house_rent"`)
    await queryRunner.query(
      `ALTER TABLE "house_rents" ADD "base_house_rent" numeric(10,2) NOT NULL DEFAULT '0'`
    )
    await queryRunner.query(`ALTER TABLE "house_rents" DROP COLUMN "payment_fee"`)
    await queryRunner.query(
      `ALTER TABLE "house_rents" ADD "payment_fee" numeric(10,2) NOT NULL DEFAULT '0'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "house_rents" DROP COLUMN "payment_fee"`)
    await queryRunner.query(
      `ALTER TABLE "house_rents" ADD "payment_fee" integer NOT NULL DEFAULT '0'`
    )
    await queryRunner.query(`ALTER TABLE "house_rents" DROP COLUMN "base_house_rent"`)
    await queryRunner.query(
      `ALTER TABLE "house_rents" ADD "base_house_rent" integer NOT NULL DEFAULT '0'`
    )
    await queryRunner.query(`ALTER TABLE "house_rent_details" DROP COLUMN "water_price"`)
    await queryRunner.query(
      `ALTER TABLE "house_rent_details" ADD "water_price" integer NOT NULL DEFAULT '0'`
    )
    await queryRunner.query(`ALTER TABLE "house_rent_details" DROP COLUMN "house_rent_price"`)
    await queryRunner.query(
      `ALTER TABLE "house_rent_details" ADD "house_rent_price" integer NOT NULL DEFAULT '0'`
    )
  }
}
