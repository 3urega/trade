import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTradingPresets1741270000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create trading_presets table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trading_presets" (
        "id"                    UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "name"                  VARCHAR(100)  NOT NULL,
        "wallet_id"             UUID           NOT NULL,
        "status"                VARCHAR(10)   NOT NULL DEFAULT 'active',
        "initial_capital"       NUMERIC(20,2) NOT NULL DEFAULT 10000,
        "model_snapshot_id"     VARCHAR(50)   NOT NULL DEFAULT 'latest',
        "signal_threshold"      NUMERIC(10,6) NOT NULL DEFAULT 0.0005,
        "position_mode"         VARCHAR(10)   NOT NULL DEFAULT 'fixed',
        "fixed_amount"          NUMERIC(20,8) NOT NULL DEFAULT 0.001,
        "position_size_pct"     NUMERIC(5,4)  NOT NULL DEFAULT 0.5,
        "active_pairs"          JSONB         NOT NULL DEFAULT '["BTC/USDT","ETH/USDT","SOL/USDT"]'::jsonb,
        "signal_timeframe"      VARCHAR(5)    NOT NULL DEFAULT '5m',
        "polling_interval_ms"   INT           NOT NULL DEFAULT 5000,
        "cooldown_ms"           INT           NOT NULL DEFAULT 0,
        "stop_loss_pct"         NUMERIC(5,4)  DEFAULT NULL,
        "take_profit_pct"       NUMERIC(5,4)  DEFAULT NULL,
        "max_drawdown_pct"      NUMERIC(5,4)  DEFAULT NULL,
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trading_presets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_trading_presets_wallet" FOREIGN KEY ("wallet_id") REFERENCES "wallets" ("id") ON DELETE RESTRICT
      )
    `);

    // 2. Ensure simulation-bot wallet exists (create if not)
    await queryRunner.query(`
      INSERT INTO "wallets" ("id", "owner_id", "balances", "created_at")
      SELECT uuid_generate_v4(), 'simulation-bot', '{"USDT": 10000}'::jsonb, now()
      WHERE NOT EXISTS (SELECT 1 FROM "wallets" WHERE "owner_id" = 'simulation-bot')
    `);

    // 3. Migrate data from trading_config to trading_presets
    await queryRunner.query(`
      INSERT INTO "trading_presets" (
        "name", "wallet_id", "status", "initial_capital",
        "model_snapshot_id", "signal_threshold", "position_mode", "fixed_amount", "position_size_pct",
        "active_pairs", "signal_timeframe", "polling_interval_ms", "cooldown_ms",
        "stop_loss_pct", "take_profit_pct", "max_drawdown_pct",
        "created_at", "updated_at"
      )
      SELECT
        'Default',
        (SELECT "id" FROM "wallets" WHERE "owner_id" = 'simulation-bot' LIMIT 1),
        'active',
        10000,
        COALESCE(tc."model_snapshot_id", 'latest'),
        COALESCE(tc."signal_threshold"::float, 0.0005),
        COALESCE(tc."position_mode", 'fixed'),
        COALESCE(tc."fixed_amount"::float, 0.001),
        COALESCE(tc."position_size_pct"::float, 0.5),
        COALESCE(tc."active_pairs", '["BTC/USDT","ETH/USDT","SOL/USDT"]'::jsonb),
        COALESCE(tc."signal_timeframe", '5m'),
        COALESCE(tc."polling_interval_ms", 5000),
        COALESCE(tc."cooldown_ms", 0),
        tc."stop_loss_pct"::float,
        tc."take_profit_pct"::float,
        tc."max_drawdown_pct"::float,
        now(),
        COALESCE(tc."updated_at", now())
      FROM "trading_config" tc
      WHERE EXISTS (SELECT 1 FROM "trading_config" LIMIT 1)
    `);

    // 4. If trading_config was empty (fresh install), create default preset anyway
    await queryRunner.query(`
      INSERT INTO "trading_presets" (
        "name", "wallet_id", "status", "initial_capital",
        "model_snapshot_id", "signal_threshold", "position_mode", "fixed_amount", "position_size_pct",
        "active_pairs", "signal_timeframe", "polling_interval_ms", "cooldown_ms",
        "created_at", "updated_at"
      )
      SELECT
        'Default',
        (SELECT "id" FROM "wallets" WHERE "owner_id" = 'simulation-bot' LIMIT 1),
        'active',
        10000,
        'latest', 0.0005, 'fixed', 0.001, 0.5,
        '["BTC/USDT","ETH/USDT","SOL/USDT"]'::jsonb,
        '5m', 5000, 0,
        now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM "trading_presets" LIMIT 1)
    `);

    // 5. Drop trading_config (app will need PresetService in Phase 2 to work)
    // trading_config se elimina en Fase 10 al retirar TradingConfigService
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate trading_config
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

    // Restore trading_config from first preset (Default) if exists
    await queryRunner.query(`
      INSERT INTO "trading_config" (
        "id", "model_snapshot_id", "signal_threshold", "position_mode", "fixed_amount", "position_size_pct",
        "active_pairs", "signal_timeframe", "polling_interval_ms", "cooldown_ms",
        "stop_loss_pct", "take_profit_pct", "max_drawdown_pct", "updated_at"
      )
      SELECT
        'default',
        COALESCE(tp."model_snapshot_id", 'latest'),
        COALESCE(tp."signal_threshold"::float, 0.0005),
        COALESCE(tp."position_mode", 'fixed'),
        COALESCE(tp."fixed_amount"::float, 0.001),
        COALESCE(tp."position_size_pct"::float, 0.5),
        COALESCE(tp."active_pairs", '["BTC/USDT","ETH/USDT","SOL/USDT"]'::jsonb),
        COALESCE(tp."signal_timeframe", '5m'),
        COALESCE(tp."polling_interval_ms", 5000),
        COALESCE(tp."cooldown_ms", 0),
        tp."stop_loss_pct"::float,
        tp."take_profit_pct"::float,
        tp."max_drawdown_pct"::float,
        COALESCE(tp."updated_at", now())
      FROM "trading_presets" tp
      WHERE tp."name" = 'Default'
      LIMIT 1
      ON CONFLICT ("id") DO UPDATE SET
        "model_snapshot_id" = EXCLUDED."model_snapshot_id",
        "signal_threshold" = EXCLUDED."signal_threshold",
        "position_mode" = EXCLUDED."position_mode",
        "fixed_amount" = EXCLUDED."fixed_amount",
        "position_size_pct" = EXCLUDED."position_size_pct",
        "active_pairs" = EXCLUDED."active_pairs",
        "signal_timeframe" = EXCLUDED."signal_timeframe",
        "polling_interval_ms" = EXCLUDED."polling_interval_ms",
        "cooldown_ms" = EXCLUDED."cooldown_ms",
        "stop_loss_pct" = EXCLUDED."stop_loss_pct",
        "take_profit_pct" = EXCLUDED."take_profit_pct",
        "max_drawdown_pct" = EXCLUDED."max_drawdown_pct",
        "updated_at" = EXCLUDED."updated_at"
    `);

    // If no preset existed, ensure trading_config has default row
    await queryRunner.query(`
      INSERT INTO "trading_config" ("id") VALUES ('default')
      ON CONFLICT ("id") DO NOTHING
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "trading_presets"`);
  }
}
