import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddTableBill1753256270978 implements MigrationInterface {
  name = 'AddTableBill1753256270978'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bill" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "items" jsonb NOT NULL, "friends" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_683b47912b8b30fe71d1fa22199" PRIMARY KEY ("id"))`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bill"`)
  }
}
