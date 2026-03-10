import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPredictionCorrelationAndMode1741290000000 implements MigrationInterface {
  name = 'AddPredictionCorrelationAndMode1741290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backtest_sessions"
        ADD COLUMN IF NOT EXISTS "prediction_correlation" FLOAT          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "prediction_mode"        VARCHAR(20)    DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "volatility_threshold"   FLOAT          DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backtest_sessions"
        DROP COLUMN IF EXISTS "volatility_threshold",
        DROP COLUMN IF EXISTS "prediction_mode",
        DROP COLUMN IF EXISTS "prediction_correlation"
    `);
  }
}
