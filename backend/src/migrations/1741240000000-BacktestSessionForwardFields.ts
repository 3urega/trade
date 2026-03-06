import { MigrationInterface, QueryRunner } from 'typeorm';

export class BacktestSessionForwardFields1741240000000 implements MigrationInterface {
  name = 'BacktestSessionForwardFields1741240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backtest_sessions"
        ADD COLUMN IF NOT EXISTS "session_type"       VARCHAR(20) NOT NULL DEFAULT 'BACKTEST',
        ADD COLUMN IF NOT EXISTS "model_snapshot_id"   VARCHAR(50),
        ADD COLUMN IF NOT EXISTS "source_session_id"   UUID
    `);

    await queryRunner.query(`
      ALTER TABLE "backtest_sessions"
        ADD CONSTRAINT "FK_backtest_sessions_source"
        FOREIGN KEY ("source_session_id") REFERENCES "backtest_sessions" ("id")
        ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "backtest_sessions"
        DROP CONSTRAINT IF EXISTS "FK_backtest_sessions_source"
    `);

    await queryRunner.query(`
      ALTER TABLE "backtest_sessions"
        DROP COLUMN IF EXISTS "source_session_id",
        DROP COLUMN IF EXISTS "model_snapshot_id",
        DROP COLUMN IF EXISTS "session_type"
    `);
  }
}
