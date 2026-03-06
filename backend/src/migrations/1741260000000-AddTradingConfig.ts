import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTradingConfig1741260000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trading_config" (
        "id"                  VARCHAR(50)   NOT NULL DEFAULT 'default',
        "model_snapshot_id"   VARCHAR(50)   NOT NULL DEFAULT 'latest',
        "signal_threshold"    NUMERIC(10,6) NOT NULL DEFAULT 0.0005,
        "position_mode"       VARCHAR(10)   NOT NULL DEFAULT 'fixed',
        "fixed_amount"        NUMERIC(20,8) NOT NULL DEFAULT 0.001,
        "position_size_pct"   NUMERIC(5,4)  NOT NULL DEFAULT 0.5,
        "active_pairs"        JSONB         NOT NULL DEFAULT '["BTC/USDT","ETH/USDT","SOL/USDT"]'::jsonb,
        "signal_timeframe"    VARCHAR(5)    NOT NULL DEFAULT '5m',
        "polling_interval_ms" INT           NOT NULL DEFAULT 5000,
        "cooldown_ms"         INT           NOT NULL DEFAULT 0,
        "stop_loss_pct"       NUMERIC(5,4)  DEFAULT NULL,
        "take_profit_pct"     NUMERIC(5,4)  DEFAULT NULL,
        "max_drawdown_pct"    NUMERIC(5,4)  DEFAULT NULL,
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trading_config" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "trading_config" ("id") VALUES ('default') ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "trading_config"`);
  }
}
