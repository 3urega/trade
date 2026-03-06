import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('trading_config')
export class TradingConfigOrmEntity {
  @PrimaryColumn({ length: 50 })
  id!: string;

  @Column({ name: 'model_snapshot_id', length: 50, default: 'latest' })
  modelSnapshotId!: string;

  @Column({ name: 'signal_threshold', type: 'numeric', precision: 10, scale: 6, default: 0.0005 })
  signalThreshold!: number;

  @Column({ name: 'position_mode', length: 10, default: 'fixed' })
  positionMode!: 'fixed' | 'percent';

  @Column({ name: 'fixed_amount', type: 'numeric', precision: 20, scale: 8, default: 0.001 })
  fixedAmount!: number;

  @Column({ name: 'position_size_pct', type: 'numeric', precision: 5, scale: 4, default: 0.5 })
  positionSizePct!: number;

  @Column({ name: 'active_pairs', type: 'jsonb', default: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'] })
  activePairs!: string[];

  @Column({ name: 'signal_timeframe', length: 5, default: '5m' })
  signalTimeframe!: string;

  @Column({ name: 'polling_interval_ms', type: 'int', default: 5000 })
  pollingIntervalMs!: number;

  @Column({ name: 'cooldown_ms', type: 'int', default: 0 })
  cooldownMs!: number;

  @Column({ name: 'stop_loss_pct', type: 'numeric', precision: 5, scale: 4, nullable: true })
  stopLossPct!: number | null;

  @Column({ name: 'take_profit_pct', type: 'numeric', precision: 5, scale: 4, nullable: true })
  takeProfitPct!: number | null;

  @Column({ name: 'max_drawdown_pct', type: 'numeric', precision: 5, scale: 4, nullable: true })
  maxDrawdownPct!: number | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
