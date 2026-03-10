import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PREDICTION_REPOSITORY } from '../../domain/ports/prediction-repository.port.js';
import type { PredictionRepositoryPort } from '../../domain/ports/prediction-repository.port.js';
import { BACKTEST_REPOSITORY } from '../../domain/ports/backtest-repository.port.js';
import type { BacktestRepositoryPort } from '../../domain/ports/backtest-repository.port.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

export interface PermutationTestResult {
  sessionId: string;
  n: number;
  permutations: number;
  realCorrelation: number;
  permCorrelations: number[];
  pValueCorrelation: number;
}

@Injectable()
export class RunPermutationTestUseCase {
  constructor(
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
    @Inject(PREDICTION_REPOSITORY) private readonly predictionRepo: PredictionRepositoryPort,
  ) {}

  async execute(sessionId: string, permutations = 500): Promise<PermutationTestResult> {
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

    const realCorrelation = pearsonCorrelation(predicted, actual);

    // Run permutations: shuffle actual returns and recalculate correlation
    const permCorrelations: number[] = [];
    const shuffled = [...actual];
    for (let p = 0; p < permutations; p++) {
      fisherYatesShuffle(shuffled);
      permCorrelations.push(pearsonCorrelation(predicted, shuffled));
    }

    // Empirical p-value: fraction of permutations with |r| >= |realCorrelation|
    const absReal = Math.abs(realCorrelation);
    const extremeCount = permCorrelations.filter((r) => Math.abs(r) >= absReal).length;
    const pValueCorrelation = extremeCount / permutations;

    return {
      sessionId,
      n: pairs.length,
      permutations,
      realCorrelation,
      permCorrelations,
      pValueCorrelation,
    };
  }
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, _, i) => a + x[i] * y[i], 0);
  const sumX2 = x.reduce((a, v) => a + v * v, 0);
  const sumY2 = y.reduce((a, v) => a + v * v, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

function fisherYatesShuffle(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
