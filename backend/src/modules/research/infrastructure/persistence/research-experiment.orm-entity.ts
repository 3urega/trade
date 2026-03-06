import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('research_experiments')
export class ResearchExperimentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 60 })
  name!: string;

  @Column({ length: 20, default: 'BTCUSDT' })
  symbol!: string;

  @Column({ length: 5, default: '1h' })
  timeframe!: string;

  @Column({ name: 'model_type', length: 30, default: 'sgd_regressor' })
  modelType!: string;

  @Column({ name: 'warmup_period', type: 'int', default: 20 })
  warmupPeriod!: number;

  @Column({ name: 'train_window_days', type: 'int', default: 90 })
  trainWindowDays!: number;

  @Column({ name: 'forward_window_days', type: 'int', default: 7 })
  forwardWindowDays!: number;

  @Column({ name: 'initial_capital', type: 'numeric', precision: 20, scale: 2, default: 10000 })
  initialCapital!: number;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @Column({ name: 'last_run_status', type: 'varchar', length: 20, nullable: true })
  lastRunStatus!: string | null;

  @Column({ name: 'last_backtest_session_id', type: 'varchar', length: 50, nullable: true })
  lastBacktestSessionId!: string | null;

  @Column({ name: 'last_forward_session_id', type: 'varchar', length: 50, nullable: true })
  lastForwardSessionId!: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
