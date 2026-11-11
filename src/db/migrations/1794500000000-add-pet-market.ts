import { MigrationInterface, QueryRunner } from 'typeorm'

// Pet market: the listings table, plus two monster columns (is_listed freezes a listed pet,
// market_bound_until is the resale cooldown after a purchase).
export class AddPetMarket1794500000000 implements MigrationInterface {
  name = 'AddPetMarket1794500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "monsters" ADD "is_listed" boolean NOT NULL DEFAULT false`)
    await queryRunner.query(
      `ALTER TABLE "monsters" ADD "market_bound_until" TIMESTAMP WITH TIME ZONE`
    )
    await queryRunner.query(
      `CREATE TABLE "pet_listings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "seller_id" uuid NOT NULL, "buyer_id" uuid, "monster_id" uuid NOT NULL, "price" integer NOT NULL, "fee" integer NOT NULL DEFAULT '0', "status" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "sold_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_pet_listings_id" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_pet_listings_status_expires_at" ON "pet_listings" ("status", "expires_at") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_pet_listings_seller_id" ON "pet_listings" ("seller_id") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_pet_listings_buyer_id_sold_at" ON "pet_listings" ("buyer_id", "sold_at") WHERE deleted_at IS NULL`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_pet_listings_monster_id_active" ON "pet_listings" ("monster_id") WHERE status = 'active' AND deleted_at IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pet_listings"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "market_bound_until"`)
    await queryRunner.query(`ALTER TABLE "monsters" DROP COLUMN "is_listed"`)
  }
}
