import { PredictionRecord } from '../entities/prediction-record.entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

export const PREDICTION_REPOSITORY = Symbol('PREDICTION_REPOSITORY');

export interface PredictionRepositoryPort {
  saveBatch(records: PredictionRecord[]): Promise<void>;
  findBySessionId(sessionId: UniqueEntityId): Promise<PredictionRecord[]>;
}
