import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPermission1758133449187 implements MigrationInterface {
    name = 'AddPermission1758133449187'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_b4532c45d93ae8d17fde779a30"`);
        await queryRunner.query(`ALTER TYPE "public"."permissions_feature_name_enum" RENAME TO "permissions_feature_name_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."permissions_feature_name_enum" AS ENUM('house_rent', 'bill', 'user', 'user_permissions')`);
        await queryRunner.query(`ALTER TABLE "permissions" ALTER COLUMN "feature_name" TYPE "public"."permissions_feature_name_enum" USING "feature_name"::"text"::"public"."permissions_feature_name_enum"`);
        await queryRunner.query(`DROP TYPE "public"."permissions_feature_name_enum_old"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b4532c45d93ae8d17fde779a30" ON "permissions" ("user_id", "feature_name") WHERE deleted_at IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_b4532c45d93ae8d17fde779a30"`);
        await queryRunner.query(`CREATE TYPE "public"."permissions_feature_name_enum_old" AS ENUM('house_rent', 'bill', 'user')`);
        await queryRunner.query(`ALTER TABLE "permissions" ALTER COLUMN "feature_name" TYPE "public"."permissions_feature_name_enum_old" USING "feature_name"::"text"::"public"."permissions_feature_name_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."permissions_feature_name_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."permissions_feature_name_enum_old" RENAME TO "permissions_feature_name_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b4532c45d93ae8d17fde779a30" ON "permissions" ("user_id", "feature_name") WHERE (deleted_at IS NULL)`);
    }

}
