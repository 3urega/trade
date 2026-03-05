import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PredictionRepositoryPort } from '../../domain/ports/prediction-repository.port.js';
import { PredictionRecord } from '../../domain/entities/prediction-record.entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { PredictionOrmEntity } from './prediction.orm-entity.js';

@Injectable()
export class PredictionTypeOrmRepository implements PredictionRepositoryPort {
  constructor(
    @InjectRepository(PredictionOrmEntity)
    private readonly repo: Repository<PredictionOrmEntity>,
  ) {}

  async saveBatch(records: PredictionRecord[]): Promise<void> {
    const orms = records.map((r) => this.toOrm(r));
    await this.repo.save(orms);
  }

  async findBySessionId(sessionId: UniqueEntityId): Promise<PredictionRecord[]> {
    const orms = await this.repo.find({
      where: { sessionId: sessionId.value },
      order: { timestamp: 'ASC' },
    });
    return orms.map((o) => this.toDomain(o));
  }

  private toOrm(record: PredictionRecord): PredictionOrmEntity {
    const orm = new PredictionOrmEntity();
    orm.id = record.id.value;
    orm.sessionId = record.sessionId.value;
    orm.timestamp = record.timestamp;
    orm.predicted = record.predicted;
    orm.actual = record.actual;
    orm.absoluteError = record.absoluteError;
    orm.squaredError = record.squaredError;
    orm.directionCorrect = record.directionCorrect;
    return orm;
  }

  private toDomain(orm: PredictionOrmEntity): PredictionRecord {
    return PredictionRecord.reconstitute(
      {
        sessionId: new UniqueEntityId(orm.sessionId),
        timestamp: orm.timestamp,
        predicted: Number(orm.predicted),
        actual: Number(orm.actual),
        absoluteError: Number(orm.absoluteError),
        squaredError: Number(orm.squaredError),
        directionCorrect: orm.directionCorrect,
      },
      new UniqueEntityId(orm.id),
    );
  }
}
