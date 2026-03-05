import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('wallets')
export class WalletOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'owner_id', unique: true })
  ownerId!: string;

  @Column('jsonb', { default: {} })
  balances!: Record<string, number>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
