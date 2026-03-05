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

    if (candles.length < dto.warmupPeriod + 5 + 2) {
      throw new BadRequestException(
        `Not enough candles for backtest. Found ${candles.length}, need at least ${dto.warmupPeriod + 7}. Load more data first.`,
      );
    }

    const session = BacktestSession.create(
      dto.symbol,
      dto.timeframe,
      from,
      to,
      dto.modelType,
      dto.warmupPeriod,
    );

    await this.backtestRepo.save(session);

    session.start();
    await this.backtestRepo.save(session);

    try {
      await this.mlService.initialize(dto.modelType);

      const predictionRecords: PredictionRecord[] = [];
      // Need index >= 5 for features; also need i+1 to exist for log-return target
      const startIndex = Math.max(dto.warmupPeriod, 5);

      for (let i = startIndex; i < candles.length - 1; i++) {
        const featureVec = this.features.build(candles, i);

        // Target: log-return from candle[i] to candle[i+1]
        // Small values in [-0.05, 0.05] range — safe for online learning
        const logReturnTarget = Math.log(candles[i + 1].close / candles[i].close);

        // Train on current candle: features(i) -> logReturn(i -> i+1)
        await this.mlService.partialTrain(featureVec, logReturnTarget);

        // Predict the log-return for the *next* step (i+1 -> i+2) if available
        if (i + 2 >= candles.length) continue;

        let predictedLogReturn: number;
        try {
          const featureVecNext = this.features.build(candles, i + 1);
          predictedLogReturn = await this.mlService.predict(featureVecNext);
        } catch {
          continue;
        }

        // Convert predicted log-return back to price: close[i+1] * exp(predictedLogReturn)
        const predictedPrice = candles[i + 1].close * Math.exp(predictedLogReturn);
        const actualPrice = candles[i + 2].close;
        const previousClose = candles[i + 1].close;

        const error = PredictionError.from(predictedPrice, actualPrice, previousClose);
        session.registerPrediction(error);

        predictionRecords.push(
          PredictionRecord.create(
            session.id,
            candles[i + 2].openTime,
            predictedPrice,
            actualPrice,
            error.directionCorrect,
          ),
        );
      }

      await this.predictionRepo.saveBatch(predictionRecords);
      session.complete();
      await this.backtestRepo.save(session);

      this.logger.log(
        `Backtest ${session.id.value} completed: ${session.metrics.totalPredictions} predictions, ` +
        `MAE=${session.metrics.mae.toFixed(4)}, DirAcc=${session.metrics.directionalAccuracy.toFixed(1)}%`,
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
