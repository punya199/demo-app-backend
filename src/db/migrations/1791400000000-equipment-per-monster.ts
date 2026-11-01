import { MigrationInterface, QueryRunner } from 'typeorm'

export class EquipmentPerMonster1791400000000 implements MigrationInterface {
  name = 'EquipmentPerMonster1791400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "equipment_items" ADD "monster_id" uuid`)

    // Worn pieces move to the owner's selected living pet (the one the old per-player loadout was
    // applied to). Owners without a living pet get their pieces back in the bag.
    await queryRunner.query(`
      UPDATE "equipment_items" e SET "monster_id" = (
        SELECT m."id" FROM "monsters" m
        WHERE m."owner_id" = e."user_id" AND m."died_at" IS NULL AND m."deleted_at" IS NULL
        ORDER BY m."selected_at" DESC NULLS LAST, m."born_at" DESC LIMIT 1)
      WHERE e."equipped" AND e."deleted_at" IS NULL
    `)
    await queryRunner.query(
      `UPDATE "equipment_items" SET "equipped" = false WHERE "equipped" AND "monster_id" IS NULL`
    )

    await queryRunner.query(`DROP INDEX "public"."IDX_equipment_items_user_id_slot_equipped"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_equipment_items_monster_id_slot_equipped" ON "equipment_items" ("monster_id", "slot") WHERE equipped AND deleted_at IS NULL`
    )
    await queryRunner.query(
      `ALTER TABLE "equipment_items" ADD CONSTRAINT "FK_equipment_items_monster_id" FOREIGN KEY ("monster_id") REFERENCES "monsters"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "equipment_items" DROP CONSTRAINT "FK_equipment_items_monster_id"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_equipment_items_monster_id_slot_equipped"`)
    // Back to one loadout per player: keep the newest worn piece per slot, bag the rest.
    await queryRunner.query(`
      UPDATE "equipment_items" SET "equipped" = false WHERE "id" IN (
        SELECT "id" FROM (
          SELECT "id", row_number() OVER (PARTITION BY "user_id", "slot" ORDER BY "updated_at" DESC) AS rn
          FROM "equipment_items" WHERE "equipped" AND "deleted_at" IS NULL) ranked
        WHERE rn > 1)
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_equipment_items_user_id_slot_equipped" ON "equipment_items" ("user_id", "slot") WHERE equipped AND deleted_at IS NULL`
    )
    await queryRunner.query(`ALTER TABLE "equipment_items" DROP COLUMN "monster_id"`)
  }
}
