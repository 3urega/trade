import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('backtest_sessions')
export class BacktestSessionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 20 })
  symbol!: string;

  @Column({ length: 5 })
  timeframe!: string;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate!: Date;

  @Column({ name: 'model_type', length: 30 })
  modelType!: string;

  @Column({ name: 'warmup_period', type: 'int', default: 20 })
  warmupPeriod!: number;

  @Column({ length: 20, default: 'CREATED' })
  status!: string;

  @Column({ type: 'jsonb', default: {} })
  metrics!: Record<string, number>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;
}
