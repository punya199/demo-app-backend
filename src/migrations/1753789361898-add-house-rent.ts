import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHouseRent1753789361898 implements MigrationInterface {
    name = 'AddHouseRent1753789361898'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "attachableId" uuid NOT NULL, "attachableType" character varying NOT NULL, "fileName" character varying NOT NULL, "url" character varying NOT NULL, "mimeType" character varying NOT NULL, "size" integer, CONSTRAINT "PK_5e1f050bcff31e3084a1d662412" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_aa4cc0ec0fe4a0c13ac96a65f0" ON "attachments" ("attachableType") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_b4701a560b291dc8269d569d15" ON "attachments" ("attachableId") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE TABLE "house_rent_details" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "month" date NOT NULL, "house_rent_price" integer NOT NULL DEFAULT '0', "water_price" integer NOT NULL DEFAULT '0', "electricity" jsonb NOT NULL DEFAULT '{}', "house_rent_id" uuid NOT NULL, "houseRentId" uuid, CONSTRAINT "PK_16eac4d6a4b63ebdb52cbc7b24f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b2b7ff04a2ddebfe0dd4b1877b" ON "house_rent_details" ("house_rent_id", "month") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_4337492d500293552fb9b28c96" ON "house_rent_details" ("month") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_c39bd4a94c7b5f9cd9da1917eb" ON "house_rent_details" ("house_rent_id") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE TABLE "house_rent_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "name" character varying NOT NULL, "air_condition_unit" integer NOT NULL DEFAULT '0', "electricity_unit" jsonb NOT NULL DEFAULT '{}', "pay_internet_month_ids" jsonb NOT NULL DEFAULT '[]', "pay_electricity_month_ids" jsonb NOT NULL DEFAULT '[]', "house_rent_id" uuid NOT NULL, "houseRentId" uuid, CONSTRAINT "PK_a285184d7a779616fdb24818b3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_dffa6be0771e0b44e36aa7f70a" ON "house_rent_members" ("name") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_500b56c8f74e22eb288b7f5dd2" ON "house_rent_members" ("house_rent_id") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE TABLE "house_rents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "name" character varying NOT NULL, "electricity_summary" jsonb NOT NULL DEFAULT '{}', "base_house_rent" integer NOT NULL DEFAULT '0', "payment_fee" integer NOT NULL DEFAULT '0', "internet" jsonb NOT NULL DEFAULT '{}', "air_condition" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_636d3d084f6b967adb2cfe2f39b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_79f453b66eafc40e127389810d" ON "house_rents" ("name") WHERE deleted_at IS NULL`);
        await queryRunner.query(`ALTER TABLE "house_rent_details" ADD CONSTRAINT "FK_979a334f70480678967e023e71f" FOREIGN KEY ("houseRentId") REFERENCES "house_rents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "house_rent_members" ADD CONSTRAINT "FK_76a90ef27d88b2d8079abed82dc" FOREIGN KEY ("houseRentId") REFERENCES "house_rents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "house_rent_members" DROP CONSTRAINT "FK_76a90ef27d88b2d8079abed82dc"`);
        await queryRunner.query(`ALTER TABLE "house_rent_details" DROP CONSTRAINT "FK_979a334f70480678967e023e71f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_79f453b66eafc40e127389810d"`);
        await queryRunner.query(`DROP TABLE "house_rents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_500b56c8f74e22eb288b7f5dd2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dffa6be0771e0b44e36aa7f70a"`);
        await queryRunner.query(`DROP TABLE "house_rent_members"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c39bd4a94c7b5f9cd9da1917eb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4337492d500293552fb9b28c96"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b2b7ff04a2ddebfe0dd4b1877b"`);
        await queryRunner.query(`DROP TABLE "house_rent_details"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b4701a560b291dc8269d569d15"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aa4cc0ec0fe4a0c13ac96a65f0"`);
        await queryRunner.query(`DROP TABLE "attachments"`);
    }

}
