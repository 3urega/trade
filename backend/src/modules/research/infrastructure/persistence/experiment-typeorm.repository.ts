import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ExperimentRepositoryPort } from '../../domain/ports/experiment-repository.port.js';
import { ResearchExperimentOrmEntity } from './research-experiment.orm-entity.js';

@Injectable()
export class ExperimentTypeOrmRepository implements ExperimentRepositoryPort {
  constructor(
    @InjectRepository(ResearchExperimentOrmEntity)
    private readonly repo: Repository<ResearchExperimentOrmEntity>,
  ) {}

  findAll(): Promise<ResearchExperimentOrmEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  findById(id: string): Promise<ResearchExperimentOrmEntity | null> {
    return this.repo.findOneBy({ id });
  }

  findEnabled(): Promise<ResearchExperimentOrmEntity[]> {
    return this.repo.find({ where: { enabled: true }, order: { createdAt: 'ASC' } });
  }

  async save(entity: Partial<ResearchExperimentOrmEntity>): Promise<ResearchExperimentOrmEntity> {
    return this.repo.save(entity as ResearchExperimentOrmEntity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
