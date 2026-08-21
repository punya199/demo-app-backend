import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddLedgerItemTable1787308272786 implements MigrationInterface {
  name = 'AddLedgerItemTable1787308272786'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "paojiao_ledger_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "creator_id" uuid, "updater_id" uuid, "deleter_id" uuid, "name" character varying NOT NULL, CONSTRAINT "PK_fea7dffcc05029e8b93df34659c" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a26b2f33afeb2b426a99443811" ON "paojiao_ledger_items" ("name") WHERE deleted_at IS NULL`
    )
    // Seed with the same 14 categories that used to be hardcoded in paojiao-ledger-data.ts,
    // so existing users don't lose any dropdown options when this table takes over from it.
    const seedItems = [
      'ขาย กาก',
      'ขาย ต่อให้น้าอ้อย',
      'ขาย น้ำมัน',
      'ค่าแรงยายปิ่น',
      'ซื้อของ',
      'ฟืน',
      'มัน กุย',
      'มัน ไก่',
      'มัน ซื้อต่อน้าอ้อย',
      'มัน ติ๊ก',
      'มัน พี่เป็ก',
      'มัน หมอน',
      'มัน หอม',
      'อื่นๆ',
    ]
    for (const name of seedItems) {
      await queryRunner.query(`INSERT INTO "paojiao_ledger_items" ("name") VALUES ($1)`, [name])
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_a26b2f33afeb2b426a99443811"`)
    await queryRunner.query(`DROP TABLE "paojiao_ledger_items"`)
  }
}
