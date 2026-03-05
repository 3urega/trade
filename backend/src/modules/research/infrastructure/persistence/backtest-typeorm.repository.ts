import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BacktestRepositoryPort } from '../../domain/ports/backtest-repository.port.js';
import { BacktestSession } from '../../domain/entities/backtest-session.entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { BacktestStatus, Timeframe, ModelType } from '../../domain/enums.js';
import { BacktestMetrics } from '../../domain/value-objects/backtest-metrics.js';
import { BacktestSessionOrmEntity } from './backtest-session.orm-entity.js';

@Injectable()
export class BacktestTypeOrmRepository implements BacktestRepositoryPort {
  constructor(
    @InjectRepository(BacktestSessionOrmEntity)
    private readonly repo: Repository<BacktestSessionOrmEntity>,
  ) {}

  async save(session: BacktestSession): Promise<void> {
    await this.repo.save(this.toOrm(session));
  }

  async findById(id: UniqueEntityId): Promise<BacktestSession | null> {
    const orm = await this.repo.findOne({ where: { id: id.value } });
    return orm ? this.toDomain(orm) : null;
  }

  async findAll(): Promise<BacktestSession[]> {
    const orms = await this.repo.find({ order: { createdAt: 'DESC' } });
    return orms.map((o) => this.toDomain(o));
  }

  private toOrm(session: BacktestSession): BacktestSessionOrmEntity {
    const orm = new BacktestSessionOrmEntity();
    orm.id = session.id.value;
    orm.symbol = session.symbol;
    orm.timeframe = session.timeframe;
    orm.startDate = session.startDate;
    orm.endDate = session.endDate;
    orm.modelType = session.modelType;
    orm.warmupPeriod = session.warmupPeriod;
    orm.status = session.status;
    orm.metrics = session.metrics.toSnapshot() as unknown as Record<string, number>;
    orm.createdAt = session.createdAt;
    orm.completedAt = session.completedAt ?? null;
    orm.errorMessage = session.errorMessage ?? null;
    return orm;
  }

  private toDomain(orm: BacktestSessionOrmEntity): BacktestSession {
    const snapshot = orm.metrics as {
      totalPredictions: number;
      sumAbsoluteError: number;
      sumSquaredError: number;
      correctDirections: number;
    };
    const metrics = BacktestMetrics.reconstitute(snapshot);

    return BacktestSession.reconstitute(
      {
        symbol: orm.symbol,
        timeframe: orm.timeframe as Timeframe,
        startDate: orm.startDate,
        endDate: orm.endDate,
        modelType: orm.modelType as ModelType,
        warmupPeriod: orm.warmupPeriod,
        status: orm.status as BacktestStatus,
        metrics,
        createdAt: orm.createdAt,
        completedAt: orm.completedAt ?? undefined,
        errorMessage: orm.errorMessage ?? undefined,
      },
      new UniqueEntityId(orm.id),
    );
  }
}
