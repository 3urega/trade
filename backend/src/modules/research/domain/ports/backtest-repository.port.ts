import { BacktestSession } from '../entities/backtest-session.entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

export const BACKTEST_REPOSITORY = Symbol('BACKTEST_REPOSITORY');

export interface BacktestRepositoryPort {
  save(session: BacktestSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<BacktestSession | null>;
  findAll(): Promise<BacktestSession[]>;
}
