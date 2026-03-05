import { MigrationInterface, QueryRunner } from 'typeorm';

export class PredictionsNumericPrecision1741220000000 implements MigrationInterface {
  name = 'PredictionsNumericPrecision1741220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "predictions"
        ALTER COLUMN "absolute_error" TYPE DOUBLE PRECISION USING "absolute_error"::double precision,
        ALTER COLUMN "squared_error"  TYPE DOUBLE PRECISION USING "squared_error"::double precision
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "predictions"
        ALTER COLUMN "absolute_error" TYPE NUMERIC(20, 8) USING "absolute_error"::numeric(20, 8),
        ALTER COLUMN "squared_error"  TYPE NUMERIC(20, 8) USING "squared_error"::numeric(20, 8)
    `);
  }
}
