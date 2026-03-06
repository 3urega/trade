import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTradingMetricsToBacktestSessions1741250000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backtest_sessions"
      ADD COLUMN IF NOT EXISTS "trading_metrics" JSONB DEFAULT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backtest_sessions" DROP COLUMN IF EXISTS "trading_metrics";
    `);
  }
}
