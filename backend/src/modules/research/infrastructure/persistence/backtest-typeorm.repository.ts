import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BacktestRepositoryPort } from '../../domain/ports/backtest-repository.port.js';
import { BacktestSession, type SignalQuality } from '../../domain/entities/backtest-session.entity.js';
import type { FeatureImportanceResult } from '../../domain/ports/ml-service.port.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { BacktestStatus, Timeframe, ModelType, SessionType } from '../../domain/enums.js';
import { BacktestMetrics } from '../../domain/value-objects/backtest-metrics.js';
import type { TradingMetrics } from '../../domain/value-objects/forward-test-result.js';
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
    orm.sessionType = session.sessionType;
    orm.modelSnapshotId = session.modelSnapshotId ?? null;
    orm.sourceSessionId = session.sourceSessionId ?? null;
    orm.createdAt = session.createdAt;
    orm.completedAt = session.completedAt ?? null;
    orm.errorMessage = session.errorMessage ?? null;
    orm.tradingMetrics = session.tradingMetrics
      ? (session.tradingMetrics as unknown as Record<string, unknown>)
      : null;
    orm.predictionCorrelation = session.predictionCorrelation ?? null;
    orm.predictionMode = session.predictionMode ?? null;
    orm.volatilityThreshold = session.volatilityThreshold ?? null;
    orm.signalQuality = session.signalQuality
      ? (session.signalQuality as unknown as Record<string, unknown>)
      : null;
    orm.featureImportance = session.featureImportance
      ? (session.featureImportance as unknown as Record<string, unknown>)
      : null;
    return orm;
  }

  private toDomain(orm: BacktestSessionOrmEntity): BacktestSession {
    const metrics = BacktestMetrics.reconstitute(orm.metrics as Record<string, number>);

    const session = BacktestSession.reconstitute(
      {
        symbol: orm.symbol,
        timeframe: orm.timeframe as Timeframe,
        startDate: orm.startDate,
        endDate: orm.endDate,
        modelType: orm.modelType as ModelType,
        warmupPeriod: orm.warmupPeriod,
        status: orm.status as BacktestStatus,
        metrics,
        sessionType: (orm.sessionType as SessionType) ?? SessionType.BACKTEST,
        modelSnapshotId: orm.modelSnapshotId ?? undefined,
        sourceSessionId: orm.sourceSessionId ?? undefined,
        createdAt: orm.createdAt,
        completedAt: orm.completedAt ?? undefined,
        errorMessage: orm.errorMessage ?? undefined,
        tradingMetrics: orm.tradingMetrics
          ? (orm.tradingMetrics as unknown as TradingMetrics)
          : undefined,
        predictionCorrelation: orm.predictionCorrelation ?? undefined,
        predictionMode: orm.predictionMode ?? undefined,
        volatilityThreshold: orm.volatilityThreshold ?? undefined,
        signalQuality: orm.signalQuality
          ? (orm.signalQuality as unknown as SignalQuality)
          : undefined,
        featureImportance: orm.featureImportance
          ? (orm.featureImportance as unknown as FeatureImportanceResult)
          : undefined,
      },
      new UniqueEntityId(orm.id),
    );

    return session;
  }
}
