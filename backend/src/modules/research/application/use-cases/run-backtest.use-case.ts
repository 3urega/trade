import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CANDLE_REPOSITORY } from '../../domain/ports/candle-repository.port.js';
import type { CandleRepositoryPort } from '../../domain/ports/candle-repository.port.js';
import { BACKTEST_REPOSITORY } from '../../domain/ports/backtest-repository.port.js';
import type { BacktestRepositoryPort } from '../../domain/ports/backtest-repository.port.js';
import { PREDICTION_REPOSITORY } from '../../domain/ports/prediction-repository.port.js';
import type { PredictionRepositoryPort } from '../../domain/ports/prediction-repository.port.js';
import { ML_SERVICE_PORT } from '../../domain/ports/ml-service.port.js';
import type { MlServicePort } from '../../domain/ports/ml-service.port.js';
import { BacktestSession } from '../../domain/entities/backtest-session.entity.js';
import { PredictionRecord } from '../../domain/entities/prediction-record.entity.js';
import { PredictionError } from '../../domain/value-objects/prediction-error.js';
import { FeatureEngineeringService } from '../feature-engineering.service.js';
import { RunBacktestDto } from '../dtos/run-backtest.dto.js';
import { BacktestSessionResponseDto } from '../dtos/backtest-response.dto.js';
import { ModelType, PredictionMode } from '../../domain/enums.js';
import type { FeatureVector } from '../../domain/value-objects/feature-vector.js';

@Injectable()
export class RunBacktestUseCase {
  private readonly logger = new Logger(RunBacktestUseCase.name);

  constructor(
    @Inject(CANDLE_REPOSITORY) private readonly candleRepo: CandleRepositoryPort,
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
    @Inject(PREDICTION_REPOSITORY) private readonly predictionRepo: PredictionRepositoryPort,
    @Inject(ML_SERVICE_PORT) private readonly mlService: MlServicePort,
    private readonly features: FeatureEngineeringService,
  ) {}

  async execute(dto: RunBacktestDto): Promise<BacktestSessionResponseDto> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);

    const candles = await this.candleRepo.findBySymbolAndRange(dto.symbol, from, to, dto.timeframe);

    const minFeatureIndex = 26;
    if (candles.length < dto.warmupPeriod + minFeatureIndex + 2) {
      throw new BadRequestException(
        `Not enough candles for backtest. Found ${candles.length}, need at least ${dto.warmupPeriod + minFeatureIndex + 2}. Load more data first.`,
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
    } catch (err) {
      session.fail(String(err));
      await this.backtestRepo.save(session);
      this.logger.error(`Backtest ${session.id.value} failed: ${String(err)}`);
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
