import type { ResearchExperimentOrmEntity } from '../../infrastructure/persistence/research-experiment.orm-entity.js';

export const EXPERIMENT_REPOSITORY = Symbol('EXPERIMENT_REPOSITORY');

export interface ExperimentRepositoryPort {
  findAll(): Promise<ResearchExperimentOrmEntity[]>;
  findById(id: string): Promise<ResearchExperimentOrmEntity | null>;
  findEnabled(): Promise<ResearchExperimentOrmEntity[]>;
  save(entity: Partial<ResearchExperimentOrmEntity>): Promise<ResearchExperimentOrmEntity>;
  delete(id: string): Promise<void>;
}
