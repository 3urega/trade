import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { BACKTEST_REPOSITORY } from '../../domain/ports/backtest-repository.port.js';
import type { BacktestRepositoryPort } from '../../domain/ports/backtest-repository.port.js';
import { PREDICTION_REPOSITORY } from '../../domain/ports/prediction-repository.port.js';
import type { PredictionRepositoryPort } from '../../domain/ports/prediction-repository.port.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

export interface ParameterSweepMetric {
  value: number;
  conditionalReturnBuy: number | null;
  conditionalReturnSell: number | null;
  countBuy: number;
  countSell: number;
  sharpeRatio: number;
}

export interface ParameterSweepResult {
  sessionId: string;
  parameter: string;
  values: number[];
  metrics: ParameterSweepMetric[];
  robustnessScore: number;
}

export interface ParameterSweepDto {
  parameter: 'signalThreshold';
  min: number;
  max: number;
  steps: number;
}

@Injectable()
export class RunParameterSweepUseCase {
  constructor(
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
    @Inject(PREDICTION_REPOSITORY) private readonly predictionRepo: PredictionRepositoryPort,
  ) {}

  async execute(sessionId: string, dto: ParameterSweepDto): Promise<ParameterSweepResult> {
    if (dto.min >= dto.max) {
      throw new BadRequestException('min must be less than max');
    }
    if (dto.steps < 2 || dto.steps > 50) {
      throw new BadRequestException('steps must be between 2 and 50');
    }

    const session = await this.backtestRepo.findById(new UniqueEntityId(sessionId));
    if (!session) throw new NotFoundException(`Backtest session ${sessionId} not found`);

    const records = await this.predictionRepo.findBySessionId(session.id);
    const pairs = records.filter(
      (r) => r.predictedReturn !== undefined && r.actualReturn !== undefined,
    );

    if (pairs.length < 10) {
      throw new BadRequestException(
        `Not enough predictions with log-returns (${pairs.length}). Re-run the backtest to generate them.`,
      );
    }

    const predicted = pairs.map((r) => r.predictedReturn as number);
    const actual = pairs.map((r) => r.actualReturn as number);

    // Generate N evenly-spaced values between min and max
    const values: number[] = [];
    for (let i = 0; i < dto.steps; i++) {
      values.push(dto.min + (i / (dto.steps - 1)) * (dto.max - dto.min));
    }

    const metrics: ParameterSweepMetric[] = values.map((threshold) => {
      const buyActuals: number[] = [];
      const sellActuals: number[] = [];

      for (let i = 0; i < predicted.length; i++) {
        if (predicted[i] > threshold) buyActuals.push(actual[i]);
        else if (predicted[i] < -threshold) sellActuals.push(actual[i]);
      }

      const mean = (arr: number[]): number | null =>
        arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

      // Simulated Sharpe: treat each triggered trade as a return observation
      const tradeReturns = [
        ...buyActuals, // buy: profit if positive
        ...sellActuals.map((r) => -r), // sell: profit if return is negative (i.e. price went down)
      ];
      const sharpeRatio = computeSharpe(tradeReturns);

      return {
        value: threshold,
        conditionalReturnBuy: mean(buyActuals),
        conditionalReturnSell: mean(sellActuals),
        countBuy: buyActuals.length,
        countSell: sellActuals.length,
        sharpeRatio,
      };
    });

    // Robustness score: % of threshold values where conditionalReturnBuy > 0
    const profitable = metrics.filter(
      (m) => m.conditionalReturnBuy !== null && m.conditionalReturnBuy > 0,
    ).length;
    const robustnessScore = (profitable / metrics.length) * 100;

    return {
      sessionId,
      parameter: dto.parameter,
      values,
      metrics,
      robustnessScore,
    };
  }
}

function computeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, v) => a + (v - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  return stdDev === 0 ? 0 : mean / stdDev;
}
