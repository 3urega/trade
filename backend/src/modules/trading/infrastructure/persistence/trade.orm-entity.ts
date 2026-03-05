import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('trades')
export class TradeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'wallet_id' })
  walletId!: string;

  @Column({ name: 'base_currency' })
  baseCurrency!: string;

  @Column({ name: 'quote_currency' })
  quoteCurrency!: string;

  @Column()
  type!: string;

  @Column('decimal', { precision: 20, scale: 8 })
  amount!: number;

  @Column('decimal', { name: 'price', precision: 20, scale: 8 })
  price!: number;

  @Column('decimal', { name: 'fee', precision: 20, scale: 8 })
  fee!: number;

  @Column()
  status!: string;

  @CreateDateColumn({ name: 'executed_at' })
  executedAt!: Date;
}
