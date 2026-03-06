import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
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
import { RunForwardTestDto } from '../dtos/run-forward-test.dto.js';
import { BacktestSessionResponseDto } from '../dtos/backtest-response.dto.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { BacktestStatus } from '../../domain/enums.js';

@Injectable()
export class RunForwardTestUseCase {
  private readonly logger = new Logger(RunForwardTestUseCase.name);

  constructor(
    @Inject(CANDLE_REPOSITORY) private readonly candleRepo: CandleRepositoryPort,
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
    @Inject(PREDICTION_REPOSITORY) private readonly predictionRepo: PredictionRepositoryPort,
    @Inject(ML_SERVICE_PORT) private readonly mlService: MlServicePort,
    private readonly features: FeatureEngineeringService,
  ) {}

  async execute(dto: RunForwardTestDto): Promise<BacktestSessionResponseDto> {
    const sourceSession = await this.backtestRepo.findById(new UniqueEntityId(dto.backtestSessionId));

    if (!sourceSession) {
      throw new NotFoundException(`BacktestSession ${dto.backtestSessionId} not found`);
    }
    if (sourceSession.status !== BacktestStatus.COMPLETED) {
      throw new BadRequestException(
        `BacktestSession ${dto.backtestSessionId} is not COMPLETED (status: ${sourceSession.status}). ` +
        `Only completed sessions have a saved model snapshot.`,
      );
    }
    if (!sourceSession.modelSnapshotId) {
      throw new BadRequestException(
        `BacktestSession ${dto.backtestSessionId} has no saved model snapshot. ` +
        `Re-run the backtest to generate one.`,
      );
    }

    const from = new Date(dto.from);
    const to = new Date(dto.to);

    // Prevent evaluating on training data (data leakage)
    if (from < sourceSession.endDate) {
      throw new BadRequestException(
        `Forward test range must start at or after the backtest training end date ` +
        `(${sourceSession.endDate.toISOString()}). ` +
        `Using training data for evaluation would produce invalid (over-optimistic) results.`,
      );
    }

    const candles = await this.candleRepo.findBySymbolAndRange(
      sourceSession.symbol,
      from,
      to,
      sourceSession.timeframe,
    );

    const minFeatureIndex = 26;
    if (candles.length < minFeatureIndex + 2) {
      throw new BadRequestException(
        `Not enough candles for forward test. Found ${candles.length}, need at least ${minFeatureIndex + 2}.`,
      );
    }

    const forwardSession = BacktestSession.createForwardTest(
      sourceSession.symbol,
      sourceSession.timeframe,
      from,
      to,
      sourceSession.modelType,
      sourceSession.id.value,
      sourceSession.modelSnapshotId,
    );

    await this.backtestRepo.save(forwardSession);
    forwardSession.start();
    await this.backtestRepo.save(forwardSession);

    try {
      // Load the trained model snapshot — no re-training, predict-only
      await this.mlService.loadModel(sourceSession.modelSnapshotId);

      const predictionRecords: PredictionRecord[] = [];
      const startIndex = minFeatureIndex;

      for (let i = startIndex; i < candles.length - 1; i++) {
        let predictedLogReturn: number;
        try {
          const featureVec = this.features.build(candles, i);
          predictedLogReturn = await this.mlService.predict(featureVec);
        } catch {
          continue;
        }

        // Convert predicted log-return to price
        const predictedPrice = candles[i].close * Math.exp(predictedLogReturn);
        const actualPrice = candles[i + 1].close;
        const previousClose = candles[i].close;

        const error = PredictionError.from(predictedPrice, actualPrice, previousClose, predictedLogReturn);
        forwardSession.registerPrediction(error);

        predictionRecords.push(
          PredictionRecord.create(
            forwardSession.id,
            candles[i + 1].openTime,
            predictedPrice,
            actualPrice,
            error.directionCorrect,
          ),
        );
      }

      await this.predictionRepo.saveBatch(predictionRecords);
      forwardSession.complete();
      await this.backtestRepo.save(forwardSession);

      this.logger.log(
        `ForwardTest ${forwardSession.id.value} completed: ` +
        `${forwardSession.metrics.totalPredictions} predictions, ` +
        `MAE=${forwardSession.metrics.mae.toFixed(4)}, ` +
        `DirAcc=${forwardSession.metrics.directionalAccuracy.toFixed(1)}%, ` +
        `source=${dto.backtestSessionId}`,
      );
    } catch (err) {
      forwardSession.fail(String(err));
      await this.backtestRepo.save(forwardSession);
      this.logger.error(`ForwardTest ${forwardSession.id.value} failed: ${String(err)}`);
      throw err;
    }

    return BacktestSessionResponseDto.fromDomain(forwardSession);
  }
}
