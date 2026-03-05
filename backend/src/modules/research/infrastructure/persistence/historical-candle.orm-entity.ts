import { Entity, Column, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('historical_candles')
@Unique('UQ_historical_candles_symbol_tf_time', ['symbol', 'timeframe', 'openTime'])
export class HistoricalCandleOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 20 })
  symbol!: string;

  @Column({ length: 5 })
  timeframe!: string;

  @Column({ name: 'open_time', type: 'timestamptz' })
  openTime!: Date;

  @Column('decimal', { precision: 20, scale: 8 })
  open!: number;

  @Column('decimal', { precision: 20, scale: 8 })
  high!: number;

  @Column('decimal', { precision: 20, scale: 8 })
  low!: number;

  @Column('decimal', { precision: 20, scale: 8 })
  close!: number;

  @Column('decimal', { precision: 30, scale: 8, default: 0 })
  volume!: number;
}
