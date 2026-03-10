import { Inject, Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CANDLE_REPOSITORY } from '../../domain/ports/candle-repository.port.js';
import type { CandleRepositoryPort } from '../../domain/ports/candle-repository.port.js';
import { BACKTEST_REPOSITORY } from '../../domain/ports/backtest-repository.port.js';
import type { BacktestRepositoryPort } from '../../domain/ports/backtest-repository.port.js';
import { PREDICTION_REPOSITORY } from '../../domain/ports/prediction-repository.port.js';
import type { PredictionRepositoryPort } from '../../domain/ports/prediction-repository.port.js';
import { ML_SERVICE_PORT } from '../../domain/ports/ml-service.port.js';
import type { MlServicePort } from '../../domain/ports/ml-service.port.js';
import { BinanceCandleAdapter } from '../../infrastructure/adapters/binance-candle.adapter.js';
import { BacktestSession } from '../../domain/entities/backtest-session.entity.js';
import { PredictionRecord } from '../../domain/entities/prediction-record.entity.js';
import { PredictionError } from '../../domain/value-objects/prediction-error.js';
import type { Candle } from '../../domain/value-objects/candle.js';
import { FeatureEngineeringService } from '../feature-engineering.service.js';
import { RunBacktestDto } from '../dtos/run-backtest.dto.js';
import { BacktestSessionResponseDto } from '../dtos/backtest-response.dto.js';
import { ModelType, PredictionMode, Timeframe } from '../../domain/enums.js';
import type { FeatureVector } from '../../domain/value-objects/feature-vector.js';

const TIMEFRAME_MS: Record<Timeframe, number> = {
  [Timeframe.ONE_MINUTE]: 60_000,
  [Timeframe.FIVE_MINUTES]: 5 * 60_000,
  [Timeframe.FIFTEEN_MINUTES]: 15 * 60_000,
  [Timeframe.ONE_HOUR]: 60 * 60_000,
  [Timeframe.FOUR_HOURS]: 4 * 60 * 60_000,
  [Timeframe.ONE_DAY]: 24 * 60 * 60_000,
};

@Injectable()
export class RunBacktestUseCase {
  private readonly logger = new Logger(RunBacktestUseCase.name);

  constructor(
    @Inject(CANDLE_REPOSITORY) private readonly candleRepo: CandleRepositoryPort,
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
    @Inject(PREDICTION_REPOSITORY) private readonly predictionRepo: PredictionRepositoryPort,
    @Inject(ML_SERVICE_PORT) private readonly mlService: MlServicePort,
    private readonly binanceCandles: BinanceCandleAdapter,
    private readonly features: FeatureEngineeringService,
  ) {}

  /**
   * Checks how many candles exist in the DB vs how many are expected for the
   * range. If coverage is below 95 %, fetches the full range from Binance and
   * upserts (duplicates are ignored by the DB unique constraint).
   */
  private async ensureCandles(
    symbol: string,
    timeframe: Timeframe,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    const existing = await this.candleRepo.findBySymbolAndRange(symbol, from, to, timeframe);

    const intervalMs = TIMEFRAME_MS[timeframe];
    const expectedCount = Math.floor((to.getTime() - from.getTime()) / intervalMs);
    const coverage = expectedCount > 0 ? existing.length / expectedCount : 1;

    if (coverage >= 0.95) {
      return existing;
    }

    this.logger.log(
      `Candle coverage ${(coverage * 100).toFixed(0)}% (${existing.length}/${expectedCount}) — auto-fetching from Binance`,
    );

    const fetched = await this.binanceCandles.fetchCandles(symbol, timeframe, from, to);
    if (fetched.length > 0) {
      await this.candleRepo.saveBatch(fetched);
    }

    return this.candleRepo.findBySymbolAndRange(symbol, from, to, timeframe);
  }

  async execute(dto: RunBacktestDto): Promise<BacktestSessionResponseDto> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);

    const candles = await this.ensureCandles(dto.symbol, dto.timeframe, from, to);

    const minFeatureIndex = 26;
    if (candles.length < dto.warmupPeriod + minFeatureIndex + 2) {
      throw new BadRequestException(
        `Not enough candles for backtest. Found ${candles.length}, need at least ${dto.warmupPeriod + minFeatureIndex + 2}. ` +
        `Binance may not have data for this symbol/timeframe/range.`,
      );
    }

    const predictionMode = dto.predictionMode ?? PredictionMode.RETURN;
    const volatilityThreshold = dto.volatilityThreshold ?? 0.005;
    const isVolatility = predictionMode === PredictionMode.VOLATILITY;

    const session = BacktestSession.create(
      dto.symbol,
      dto.timeframe,
      from,
      to,
      dto.modelType,
      dto.warmupPeriod,
    );
    session.setPredictionMode(predictionMode);
    if (isVolatility) session.setVolatilityThreshold(volatilityThreshold);

    await this.backtestRepo.save(session);

    session.start();
    await this.backtestRepo.save(session);

    try {
      const isEnsemble = dto.modelType === ModelType.ENSEMBLE;

      const mlTrain = (x: FeatureVector, y: number): Promise<void> => {
        if (isVolatility) return this.mlService.partialTrainClassifier(x, y);
        if (isEnsemble) return this.mlService.partialTrainEnsemble(x, y);
        return this.mlService.partialTrain(x, y);
      };

      const mlRawPredict = (x: FeatureVector): Promise<number> => {
        if (isVolatility) return this.mlService.predictProba(x);
        if (isEnsemble) return this.mlService.predictEnsemble(x);
        return this.mlService.predict(x);
      };

      if (isVolatility) {
        await this.mlService.initialize(ModelType.SGD_CLASSIFIER);
      } else if (isEnsemble) {
        await this.mlService.initializeEnsemble();
      } else {
        await this.mlService.initialize(dto.modelType);
      }

      const predictionRecords: PredictionRecord[] = [];
      const predictedReturns: number[] = [];
      const actualReturns: number[] = [];
      const startIndex = Math.max(dto.warmupPeriod, minFeatureIndex);

      for (let i = startIndex; i < candles.length - 1; i++) {
        const featureVec = this.features.build(candles, i);

        const logReturnTarget = Math.log(candles[i + 1].close / candles[i].close);
        const trainTarget = isVolatility
          ? (Math.abs(candles[i + 1].close - candles[i].close) / candles[i].close > volatilityThreshold ? 1 : 0)
          : logReturnTarget;

        if (i > startIndex) {
          try {
            const rawPrediction = await mlRawPredict(featureVec);

            // Convert probability + direction to pseudo log return so processTick works unchanged
            const predictedLogReturn = isVolatility
              ? Math.sign(featureVec.features[1]) * rawPrediction
              : rawPrediction;

            const predictedPrice = candles[i].close * Math.exp(predictedLogReturn);
            const actualPrice = candles[i + 1].close;
            const previousClose = candles[i].close;

            const error = PredictionError.from(
              predictedPrice,
              actualPrice,
              previousClose,
              predictedLogReturn,
            );
            session.registerPrediction(error);
            predictedReturns.push(predictedLogReturn);
            actualReturns.push(logReturnTarget);

            predictionRecords.push(
              PredictionRecord.create(
                session.id,
                candles[i + 1].openTime,
                predictedPrice,
                actualPrice,
                error.directionCorrect,
              ),
            );
          } catch {
            // predict failed (e.g. model not ready) — continue to train
          }
        }

        await mlTrain(featureVec, trainTarget);
      }

      await this.predictionRepo.saveBatch(predictionRecords);

      session.setPredictionCorrelation(pearsonCorrelation(predictedReturns, actualReturns));

      try {
        const snapshotId = isEnsemble && !isVolatility
          ? await this.mlService.saveEnsemble()
          : await this.mlService.saveModel();
        session.setModelSnapshotId(snapshotId);
      } catch (snapshotErr) {
        this.logger.warn(`Could not save model snapshot: ${String(snapshotErr)}`);
      }

      session.complete();
      await this.backtestRepo.save(session);

      this.logger.log(
        `Backtest ${session.id.value} completed: ${session.metrics.totalPredictions} predictions, ` +
        `MAE=${session.metrics.mae.toFixed(4)}, DirAcc=${session.metrics.directionalAccuracy.toFixed(1)}%` +
        (session.modelSnapshotId ? `, snapshot=${session.modelSnapshotId}` : ''),
      );
    } catch (err: unknown) {
      session.fail(String(err));
      await this.backtestRepo.save(session);
      this.logger.error(`Backtest ${session.id.value} failed: ${String(err)}`);
      const msg = err instanceof Error ? err.message : String(err);
      // Network/connection errors
      if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('connect') || msg.includes('Network Error')) {
        throw new ServiceUnavailableException(
          'ML Engine unreachable. Ensure it is running (e.g. docker-compose up ml-engine) and ML_ENGINE_URL is correct.',
        );
      }
      // Axios error with ML engine response (e.g. 400 Bad Request)
      const axiosErr = err as { response?: { data?: { detail?: string }; status?: number } };
      if (axiosErr?.response?.data?.detail) {
        throw new BadRequestException(`ML Engine: ${axiosErr.response.data.detail}`);
      }
      throw err;
    }

    return BacktestSessionResponseDto.fromDomain(session);
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
