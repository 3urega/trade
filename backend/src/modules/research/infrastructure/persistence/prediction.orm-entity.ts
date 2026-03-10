import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('predictions')
export class PredictionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column('decimal', { precision: 20, scale: 8 })
  predicted!: number;

  @Column('decimal', { precision: 20, scale: 8 })
  actual!: number;

  @Column({ name: 'direction_correct', type: 'boolean' })
  directionCorrect!: boolean;

  @Column({ name: 'predicted_return', type: 'float', nullable: true })
  predictedReturn!: number | null;

  @Column({ name: 'actual_return', type: 'float', nullable: true })
  actualReturn!: number | null;
}
