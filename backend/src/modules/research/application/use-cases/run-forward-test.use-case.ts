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
import { TradingSimulation } from '../../domain/value-objects/forward-test-result.js';
import type { TradingMetrics } from '../../domain/value-objects/forward-test-result.js';
import { FeatureEngineeringService } from '../feature-engineering.service.js';
import { RunForwardTestDto } from '../dtos/run-forward-test.dto.js';
import { ForwardTestResponseDto } from '../dtos/backtest-response.dto.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { BacktestStatus, ModelType, PredictionMode } from '../../domain/enums.js';

const DEFAULT_INITIAL_CAPITAL = 10000;

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

  async execute(dto: RunForwardTestDto): Promise<ForwardTestResponseDto> {
    const sourceSession = await this.backtestRepo.findById(new UniqueEntityId(dto.backtestSessionId));

    if (!sourceSession) {
      throw new NotFoundException(`BacktestSession ${dto.backtestSessionId} not found`);
    }
    if (sourceSession.status !== BacktestStatus.COMPLETED) {
      throw new BadRequestException(
        `BacktestSession ${dto.backtestSessionId} is not COMPLETED (status: ${sourceSession.status}).`,
      );
    }
    if (!sourceSession.modelSnapshotId) {
      throw new BadRequestException(
        `BacktestSession ${dto.backtestSessionId} has no saved model snapshot.`,
      );
    }

    const from = new Date(dto.from);
    const to = new Date(dto.to);

    if (!dto.allowInSample && from < sourceSession.endDate) {
      throw new BadRequestException(
        `Forward test range must start at or after the backtest training end date ` +
        `(${sourceSession.endDate.toISOString()}). ` +
        `Use allowInSample=true to simulate on the training period.`,
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

    let tradingMetrics: TradingMetrics | undefined;

    try {
      const isEnsemble = sourceSession.modelType === ModelType.ENSEMBLE;
      const isVolatility = sourceSession.predictionMode === PredictionMode.VOLATILITY;

      if (isEnsemble && !isVolatility) {
        await this.mlService.loadEnsemble(sourceSession.modelSnapshotId);
      } else {
        await this.mlService.loadModel(sourceSession.modelSnapshotId);
      }

      const predictionRecords: PredictionRecord[] = [];
      const startIndex = minFeatureIndex;
      const initialCapital = dto.initialCapital ?? DEFAULT_INITIAL_CAPITAL;
      // VOLATILITY mode uses probability as pseudo signal: default threshold is 0.6
      const signalThreshold = dto.signalThreshold ?? (isVolatility ? 0.6 : 0.0005);
      const feeRate = dto.feeRate ?? 0.001;
      const positionSizePct = dto.positionSizePct ?? 0.5;
      const slMultiplier = dto.slMultiplier ?? 2;
      const tpMultiplier = dto.tpMultiplier ?? 3;
      const simulation = TradingSimulation.create(initialCapital, feeRate, signalThreshold, positionSizePct, slMultiplier, tpMultiplier);

      for (let i = startIndex; i < candles.length - 1; i++) {
        let predictedLogReturn: number;
        let featureVec: ReturnType<typeof this.features.build>;
        try {
          featureVec = this.features.build(candles, i);
          if (isVolatility) {
            const probability = await this.mlService.predictProba(featureVec);
            const direction = Math.sign(featureVec.features[1]); // logReturn1
            predictedLogReturn = direction * probability;
          } else if (isEnsemble) {
            predictedLogReturn = await this.mlService.predictEnsemble(featureVec);
          } else {
            predictedLogReturn = await this.mlService.predict(featureVec);
          }
        } catch {
          continue;
        }

        const currentPrice = candles[i].close;
        const predictedPrice = currentPrice * Math.exp(predictedLogReturn);
        const actualPrice = candles[i + 1].close;
        const previousClose = currentPrice;

        // Model accuracy metrics (kept from original)
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

        // Trading simulation — inject current volatility (feature index 3) before tick
        simulation.setVolatility(featureVec.features[3]);
        simulation.processTick(predictedLogReturn, currentPrice, candles[i].openTime);
      }

      // Close any open position at the last candle price
      const lastPrice = candles[candles.length - 1].close;
      simulation.closeOpenPosition(lastPrice, candles[candles.length - 1].openTime);

      tradingMetrics = simulation.getMetrics();
      forwardSession.setTradingMetrics(tradingMetrics);

      await this.predictionRepo.saveBatch(predictionRecords);
      forwardSession.complete();
      await this.backtestRepo.save(forwardSession);

      this.logger.log(
        `ForwardTest ${forwardSession.id.value} completed: ` +
        `${forwardSession.metrics.totalPredictions} predictions, ` +
        `MAE=${forwardSession.metrics.mae.toFixed(4)}, ` +
        `DirAcc=${forwardSession.metrics.directionalAccuracy.toFixed(1)}%, ` +
        `P&L=${tradingMetrics.totalPnl.toFixed(2)} USDT (${tradingMetrics.totalPnlPercent.toFixed(2)}%), ` +
        `Trades=${tradingMetrics.totalTrades}, WinRate=${tradingMetrics.winRate.toFixed(1)}%`,
      );
    } catch (err) {
      forwardSession.fail(String(err));
      await this.backtestRepo.save(forwardSession);
      this.logger.error(`ForwardTest ${forwardSession.id.value} failed: ${String(err)}`);
      throw err;
    }

    return ForwardTestResponseDto.fromDomain(forwardSession, tradingMetrics);
  }
}
