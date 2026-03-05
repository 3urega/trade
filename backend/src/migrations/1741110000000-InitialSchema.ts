import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1741110000000 implements MigrationInterface {
  name = 'InitialSchema1741110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // pgvector and uuid-ossp are activated by docker/postgres/init.sql at container boot

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id"         UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "owner_id"   VARCHAR     NOT NULL,
        "balances"   JSONB       NOT NULL DEFAULT '{"USDT": 10000}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_owner" UNIQUE ("owner_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trades" (
        "id"             UUID           NOT NULL,
        "wallet_id"      UUID           NOT NULL,
        "base_currency"  VARCHAR(10)    NOT NULL,
        "quote_currency" VARCHAR(10)    NOT NULL,
        "type"           VARCHAR(4)     NOT NULL,
        "amount"         NUMERIC(20, 8) NOT NULL,
        "price"          NUMERIC(20, 8) NOT NULL,
        "fee"            NUMERIC(20, 8) NOT NULL DEFAULT 0,
        "status"         VARCHAR(10)    NOT NULL DEFAULT 'EXECUTED',
        "executed_at"    TIMESTAMPTZ    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trades" PRIMARY KEY ("id"),
        CONSTRAINT "FK_trades_wallet" FOREIGN KEY ("wallet_id") REFERENCES "wallets" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_trades_wallet_id"    ON "trades" ("wallet_id");
      CREATE INDEX IF NOT EXISTS "IDX_trades_executed_at"  ON "trades" ("executed_at" DESC);
      CREATE INDEX IF NOT EXISTS "IDX_trades_type"         ON "trades" ("type");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "market_snapshots" (
        "id"          UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "symbol"      VARCHAR(20)    NOT NULL,
        "price"       NUMERIC(20, 8) NOT NULL,
        "volume"      NUMERIC(30, 8),
        "source"      VARCHAR(20)    NOT NULL DEFAULT 'binance',
        "recorded_at" TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "embedding"   vector(1536),
        CONSTRAINT "PK_market_snapshots" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_market_snapshots_symbol"      ON "market_snapshots" ("symbol");
      CREATE INDEX IF NOT EXISTS "IDX_market_snapshots_recorded_at" ON "market_snapshots" ("recorded_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "market_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trades"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallets"`);
  }
}
