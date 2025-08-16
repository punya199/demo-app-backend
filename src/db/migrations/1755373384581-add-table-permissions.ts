import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTablePermissions1755373384581 implements MigrationInterface {
    name = 'AddTablePermissions1755373384581'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."permissions_feature_name_enum" AS ENUM('house_rent', 'bill', 'user')`);
        await queryRunner.query(`CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "user_id" uuid NOT NULL, "feature_name" "public"."permissions_feature_name_enum" NOT NULL, "action" character varying(4) NOT NULL DEFAULT '0000', CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5f6890b717390a248d7d3efcf8" ON "permissions" ("user_id") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_dad2c96aedb953d5645e52eeac" ON "permissions" ("feature_name") WHERE deleted_at IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b4532c45d93ae8d17fde779a30" ON "permissions" ("user_id", "feature_name") WHERE deleted_at IS NULL`);
        await queryRunner.query(`ALTER TABLE "permissions" ADD CONSTRAINT "FK_03f05d2567b1421a6f294d69f45" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "permissions" DROP CONSTRAINT "FK_03f05d2567b1421a6f294d69f45"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b4532c45d93ae8d17fde779a30"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dad2c96aedb953d5645e52eeac"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5f6890b717390a248d7d3efcf8"`);
        await queryRunner.query(`DROP TABLE "permissions"`);
        await queryRunner.query(`DROP TYPE "public"."permissions_feature_name_enum"`);
    }

}
