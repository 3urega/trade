import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResearchExperiments1741280000000 implements MigrationInterface {
  name = 'AddResearchExperiments1741280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "research_experiments" (
        "id"                        UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "name"                      VARCHAR(60)    NOT NULL,
        "symbol"                    VARCHAR(20)    NOT NULL DEFAULT 'BTCUSDT',
        "timeframe"                 VARCHAR(5)     NOT NULL DEFAULT '1h',
        "model_type"                VARCHAR(30)    NOT NULL DEFAULT 'sgd_regressor',
        "warmup_period"             INTEGER        NOT NULL DEFAULT 20,
        "train_window_days"         INTEGER        NOT NULL DEFAULT 90,
        "forward_window_days"       INTEGER        NOT NULL DEFAULT 7,
        "initial_capital"           NUMERIC(20,2)  NOT NULL DEFAULT 10000,
        "enabled"                   BOOLEAN        NOT NULL DEFAULT true,
        "last_run_at"               TIMESTAMPTZ,
        "last_run_status"           VARCHAR(20),
        "last_backtest_session_id"  UUID,
        "last_forward_session_id"   UUID,
        "last_error"                TEXT,
        "created_at"                TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMPTZ    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_research_experiments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_research_experiments_backtest"
          FOREIGN KEY ("last_backtest_session_id")
          REFERENCES "backtest_sessions" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_research_experiments_forward"
          FOREIGN KEY ("last_forward_session_id")
          REFERENCES "backtest_sessions" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_research_experiments_enabled"
        ON "research_experiments" ("enabled")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "research_experiments"`);
  }
}
