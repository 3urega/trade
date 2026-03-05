import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResearchSchema1741200000000 implements MigrationInterface {
  name = 'ResearchSchema1741200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "historical_candles" (
        "id"          UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "symbol"      VARCHAR(20)    NOT NULL,
        "timeframe"   VARCHAR(5)     NOT NULL,
        "open_time"   TIMESTAMPTZ    NOT NULL,
        "open"        NUMERIC(20, 8) NOT NULL,
        "high"        NUMERIC(20, 8) NOT NULL,
        "low"         NUMERIC(20, 8) NOT NULL,
        "close"       NUMERIC(20, 8) NOT NULL,
        "volume"      NUMERIC(30, 8) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_historical_candles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_historical_candles_symbol_tf_time" UNIQUE ("symbol", "timeframe", "open_time")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_historical_candles_symbol_tf_time"
        ON "historical_candles" ("symbol", "timeframe", "open_time" ASC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "backtest_sessions" (
        "id"            UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "symbol"        VARCHAR(20)    NOT NULL,
        "timeframe"     VARCHAR(5)     NOT NULL,
        "start_date"    TIMESTAMPTZ    NOT NULL,
        "end_date"      TIMESTAMPTZ    NOT NULL,
        "model_type"    VARCHAR(30)    NOT NULL,
        "warmup_period" INTEGER        NOT NULL DEFAULT 20,
        "status"        VARCHAR(20)    NOT NULL DEFAULT 'CREATED',
        "metrics"       JSONB          NOT NULL DEFAULT '{}'::jsonb,
        "created_at"    TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "completed_at"  TIMESTAMPTZ,
        "error_message" TEXT,
        CONSTRAINT "PK_backtest_sessions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_backtest_sessions_symbol"
        ON "backtest_sessions" ("symbol")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_backtest_sessions_status"
        ON "backtest_sessions" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "predictions" (
        "id"                UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "session_id"        UUID           NOT NULL,
        "timestamp"         TIMESTAMPTZ    NOT NULL,
        "predicted"         NUMERIC(20, 8) NOT NULL,
        "actual"            NUMERIC(20, 8) NOT NULL,
        "absolute_error"    NUMERIC(20, 8) NOT NULL,
        "squared_error"     NUMERIC(20, 8) NOT NULL,
        "direction_correct" BOOLEAN        NOT NULL,
        CONSTRAINT "PK_predictions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_predictions_session" FOREIGN KEY ("session_id")
          REFERENCES "backtest_sessions" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_predictions_session_id"
        ON "predictions" ("session_id", "timestamp" ASC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "predictions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "backtest_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "historical_candles"`);
  }
}
