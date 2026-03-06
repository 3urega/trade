import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { ML_SERVICE_PORT } from '../../../research/domain/ports/ml-service.port.js';
import type { MlServicePort } from '../../../research/domain/ports/ml-service.port.js';
import { BACKTEST_REPOSITORY } from '../../../research/domain/ports/backtest-repository.port.js';
import type { BacktestRepositoryPort } from '../../../research/domain/ports/backtest-repository.port.js';
import { FeatureEngineeringService } from '../../../research/application/feature-engineering.service.js';
import { MARKET_DATA_PORT } from '../../domain/ports/market-data.port.js';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { Timeframe } from '../../../research/domain/enums.js';
import { TradeSignal } from '../../domain/value-objects/trade-signal.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { SignalType } from '../../domain/enums.js';
import { PresetService } from './preset.service.js';

// Need index >= 26 for features (EMA-26, Bollinger-20), plus buffer
const CANDLE_LOOKBACK = 30;

@Injectable()
export class TradingSignalService implements OnModuleInit {
  private readonly logger = new Logger(TradingSignalService.name);
  private modelLoaded = false;

  constructor(
    @Inject(ML_SERVICE_PORT) private readonly mlService: MlServicePort,
    @Inject(BACKTEST_REPOSITORY) private readonly backtestRepo: BacktestRepositoryPort,
    @Inject(MARKET_DATA_PORT) private readonly marketData: MarketDataPort,
    private readonly features: FeatureEngineeringService,
    private readonly presetService: PresetService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.tryLoadLatestModel();
  }

  /**
   * Try to load the most recent completed backtest model snapshot.
   * If none is found, trading signals will default to HOLD.
   */
  async tryLoadLatestModel(): Promise<void> {
    try {
      const sessions = await this.backtestRepo.findAll();
      const latest = sessions
        .filter((s) => s.modelSnapshotId && s.status === 'COMPLETED' as unknown)
        .sort((a, b) => {
          const at = a.completedAt?.getTime() ?? 0;
          const bt = b.completedAt?.getTime() ?? 0;
          return bt - at;
        })[0];

      if (!latest?.modelSnapshotId) {
        this.logger.warn('No ML model snapshot available — trading signals will be HOLD until a backtest is completed.');
        this.modelLoaded = false;
        return;
      }

      await this.mlService.loadModel(latest.modelSnapshotId);
      this.modelLoaded = true;
      this.logger.log(
        `ML model loaded: snapshot=${latest.modelSnapshotId} from session ${latest.id.value.slice(0, 8)}`,
      );
    } catch (err) {
      this.logger.warn(`Could not load ML model on startup: ${String(err)}`);
      this.modelLoaded = false;
    }
  }

  /** Manually reload a specific model snapshot. */
  async loadModel(snapshotId: string): Promise<void> {
    await this.mlService.loadModel(snapshotId);
    this.modelLoaded = true;
    this.logger.log(`ML model manually reloaded: ${snapshotId}`);
  }

  /**
   * Generate a trading signal for a given pair + timeframe using the loaded ML model.
   * Returns HOLD if no model is loaded or not enough candle data is available.
   * @param threshold Override the signal threshold (e.g. per-preset value). Falls back to the
   *   first active preset's threshold when not provided.
   */
  async getSignal(
    pair: { base: string; quote: string },
    timeframe: Timeframe = Timeframe.FIVE_MINUTES,
    threshold?: number,
  ): Promise<TradeSignal> {
    const symbol = `${pair.base}${pair.quote}`;
    const cryptoPair = CryptoPair.create(pair.base, pair.quote);

    if (!this.modelLoaded) {
      return TradeSignal.create(SignalType.HOLD, cryptoPair, 0, 0);
    }

    try {
      const candles = await this.marketData.getRecentCandles(cryptoPair, timeframe, CANDLE_LOOKBACK);

      if (candles.length < 27) {
        this.logger.debug(`Not enough candles for ${symbol} (${candles.length}/${CANDLE_LOOKBACK}) — HOLD`);
        return TradeSignal.create(SignalType.HOLD, cryptoPair, 0, 0);
      }

      const lastIndex = candles.length - 1;
      const featureVec = this.features.build(candles, lastIndex);
      const predictedLogReturn = await this.mlService.predict(featureVec);

      const lastClose = candles[lastIndex].close;
      const targetPrice = lastClose * Math.exp(predictedLogReturn);
      const confidence = Math.abs(predictedLogReturn);

      const resolvedThreshold =
        threshold ?? this.presetService.getConfigForSimulation().signalThreshold;

      let signalType: SignalType;
      if (predictedLogReturn > resolvedThreshold) {
        signalType = SignalType.BUY;
      } else if (predictedLogReturn < -resolvedThreshold) {
        signalType = SignalType.SELL;
      } else {
        signalType = SignalType.HOLD;
      }

      this.logger.debug(
        `Signal for ${symbol}: ${signalType} (logReturn=${predictedLogReturn.toFixed(6)}, threshold=±${resolvedThreshold})`,
      );

      return TradeSignal.create(signalType, cryptoPair, targetPrice, confidence);
    } catch (err) {
      this.logger.debug(`Signal failed for ${symbol}: ${String(err)} — HOLD`);
      return TradeSignal.create(SignalType.HOLD, cryptoPair, 0, 0);
    }
  }

  get isModelReady(): boolean {
    return this.modelLoaded;
  }
}
