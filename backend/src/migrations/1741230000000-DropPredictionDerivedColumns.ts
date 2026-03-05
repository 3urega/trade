import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPredictionDerivedColumns1741230000000 implements MigrationInterface {
  name = 'DropPredictionDerivedColumns1741230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "predictions"
        DROP COLUMN IF EXISTS "absolute_error",
        DROP COLUMN IF EXISTS "squared_error"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "predictions"
        ADD COLUMN IF NOT EXISTS "absolute_error" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "squared_error"  DOUBLE PRECISION NOT NULL DEFAULT 0
    `);
  }
}
