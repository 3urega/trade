import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BACKTEST_REPOSITORY } from '../../domain/ports/backtest-repository.port.js';
import type { BacktestRepositoryPort } from '../../domain/ports/backtest-repository.port.js';
import { PREDICTION_REPOSITORY } from '../../domain/ports/prediction-repository.port.js';
import type { PredictionRepositoryPort } from '../../domain/ports/prediction-repository.port.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { BacktestSessionResponseDto } from '../dtos/backtest-response.dto.js';

@Injectable()
export class GetBacktestUseCase {
  constructor(
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
    @Inject(PREDICTION_REPOSITORY) private readonly predictionRepo: PredictionRepositoryPort,
  ) {}

  async findById(id: string, includePredictions = false): Promise<BacktestSessionResponseDto> {
    const session = await this.backtestRepo.findById(new UniqueEntityId(id));
    if (!session) throw new NotFoundException(`BacktestSession ${id} not found`);

    const predictions = includePredictions
      ? await this.predictionRepo.findBySessionId(session.id)
      : undefined;

    return BacktestSessionResponseDto.fromDomain(session, predictions);
  }

  async findAll(): Promise<BacktestSessionResponseDto[]> {
    const sessions = await this.backtestRepo.findAll();
    return sessions.map((s) => BacktestSessionResponseDto.fromDomain(s));
  }
}
