import { Logger } from '@nestjs/common';
import type { PresetRecord } from '../../domain/ports/preset-repository.port.js';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { ExecuteTradeUseCase } from './execute-trade.use-case.js';
import { GetPortfolioUseCase } from './get-portfolio.use-case.js';
import { TradingSignalService } from './trading-signal.service.js';
import { TradeType } from '../../domain/enums.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { TradingGateway } from '../../infrastructure/ws/trading.gateway.js';
import { Timeframe } from '../../../research/domain/enums.js';

interface PositionState {
  hasPosition: boolean;
  entryPrice: number;
  lastTradeAt: number;
}

export interface PresetSimulationRunnerDeps {
  executeTradeUseCase: ExecuteTradeUseCase;
  getPortfolioUseCase: GetPortfolioUseCase;
  gateway: TradingGateway;
  tradingSignalService: TradingSignalService;
  marketData: MarketDataPort;
}

/**
 * Manages the simulation loop for a single preset.
 * Not a NestJS injectable — instantiated and owned by SimulationOrchestrator.
 */
export class PresetSimulationRunner {
  private readonly logger: Logger;
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly positions = new Map<string, PositionState>();
  private peakPortfolioValue: number | null = null;
  private tradingPaused = false;
  private preset: PresetRecord;
  private maxDrawdownObserved = 0;

  constructor(
    preset: PresetRecord,
    private readonly deps: PresetSimulationRunnerDeps,
  ) {
    this.preset = preset;
    this.logger = new Logger(`Runner[${preset.name}]`);
  }

  get presetId(): string {
    return this.preset.id;
  }

  get walletId(): string {
    return this.preset.walletId;
  }

  /** Maximum drawdown observed during this runner's lifetime (0–1 fraction) */
  get maxDrawdown(): number {
    return this.maxDrawdownObserved;
  }

  /** Active pair symbols (e.g. 'BTCUSDT') used by this runner */
  get activePairSymbols(): string[] {
    return this.preset.activePairs.map((p) => {
      const [base, quote] = p.split('/');
      return `${base ?? ''}${quote ?? ''}`;
    });
  }

  start(): void {
    if (this.intervalHandle) return;
    this.logger.log(
      `Starting simulation for preset "${this.preset.name}" every ${this.preset.pollingIntervalMs}ms`,
    );
    this.intervalHandle = setInterval(
      () => void this.tick(),
      this.preset.pollingIntervalMs,
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log(`Stopped simulation for preset "${this.preset.name}"`);
    }
  }

  /** Replace the preset config and restart the interval with the new polling rate. */
  updatePreset(preset: PresetRecord): void {
    const wasRunning = this.intervalHandle !== null;
    this.stop();
    this.preset = preset;
    this.logger.log(`Config updated for preset "${this.preset.name}"`);
    if (wasRunning) {
      this.start();
    }
  }

  private async tick(): Promise<void> {
    if (!this.deps.tradingSignalService.isModelReady) {
      this.logger.debug('No ML model loaded — tick skipped');
      return;
    }

    // Check max drawdown pause
    if (this.preset.maxDrawdownPct !== null && this.peakPortfolioValue !== null) {
      try {
        const portfolio = await this.deps.getPortfolioUseCase.execute(this.preset.walletId);
        const totalValue = portfolio.totalValueUsdt;
        if (totalValue > this.peakPortfolioValue) {
          this.peakPortfolioValue = totalValue;
          this.tradingPaused = false;
        }
        const drawdown = (this.peakPortfolioValue - totalValue) / this.peakPortfolioValue;
        if (drawdown > this.maxDrawdownObserved) {
          this.maxDrawdownObserved = drawdown;
        }
        if (drawdown >= this.preset.maxDrawdownPct) {
          if (!this.tradingPaused) {
            this.logger.warn(
              `Max drawdown ${(drawdown * 100).toFixed(2)}% reached — trading paused`,
            );
            this.tradingPaused = true;
          }
          return;
        }
        this.tradingPaused = false;
      } catch {
        // Portfolio fetch failed, continue
      }
    }

    const pairs = this.preset.activePairs.map((p) => {
      const [base, quote] = p.split('/');
      return { base: base!, quote: quote! };
    });

    for (const pair of pairs) {
      await this.processPair(pair);
    }
  }

  private async processPair(pair: { base: string; quote: string }): Promise<void> {
    const pairKey = `${pair.base}${pair.quote}`;
    const posState =
      this.positions.get(pairKey) ?? { hasPosition: false, entryPrice: 0, lastTradeAt: 0 };

    // Cooldown check
    if (
      this.preset.cooldownMs > 0 &&
      Date.now() - posState.lastTradeAt < this.preset.cooldownMs
    ) {
      return;
    }

    // Get real-time price via REST
    let price: number;
    try {
      const cryptoPair = CryptoPair.create(pair.base, pair.quote);
      const live = await this.deps.marketData.getCurrentPrice(cryptoPair);
      price = live.value;
    } catch {
      return;
    }

    // Check stop-loss / take-profit on open positions
    if (posState.hasPosition && posState.entryPrice > 0) {
      const pricePct = (price - posState.entryPrice) / posState.entryPrice;
      const shouldStopLoss =
        this.preset.stopLossPct !== null && pricePct <= -this.preset.stopLossPct;
      const shouldTakeProfit =
        this.preset.takeProfitPct !== null && pricePct >= this.preset.takeProfitPct;

      if (shouldStopLoss || shouldTakeProfit) {
        const reason = shouldStopLoss ? 'STOP-LOSS' : 'TAKE-PROFIT';
        this.logger.log(
          `${reason} triggered for ${pairKey}: entry=${posState.entryPrice.toFixed(2)} ` +
            `current=${price.toFixed(2)} (${(pricePct * 100).toFixed(2)}%)`,
        );
        await this.executeTrade(pair, TradeType.SELL, price, pairKey, posState);
        return;
      }
    }

    // Resolve timeframe
    const timeframeStr = this.preset.signalTimeframe;
    const timeframe = (Object.values(Timeframe) as string[]).includes(timeframeStr)
      ? (timeframeStr as Timeframe)
      : Timeframe.FIVE_MINUTES;

    // Get ML signal using this preset's threshold
    const signal = await this.deps.tradingSignalService.getSignal(
      pair,
      timeframe,
      this.preset.signalThreshold,
    );

    if (signal.isHold()) return;

    // Only BUY when flat, only SELL when holding
    if (signal.isBuy() && posState.hasPosition) return;
    if (signal.isSell() && !posState.hasPosition) return;

    const type = signal.isBuy() ? TradeType.BUY : TradeType.SELL;
    await this.executeTrade(pair, type, price, pairKey, posState);
  }

  private async executeTrade(
    pair: { base: string; quote: string },
    type: TradeType,
    price: number,
    pairKey: string,
    posState: PositionState,
  ): Promise<void> {
    let amount: number;
    if (this.preset.positionMode === 'percent') {
      try {
        const portfolio = await this.deps.getPortfolioUseCase.execute(this.preset.walletId);
        amount = (portfolio.totalValueUsdt * this.preset.positionSizePct) / price;
        amount = Math.max(amount, 0.00001);
      } catch {
        amount = this.preset.fixedAmount;
      }
    } else {
      amount = this.preset.fixedAmount;
    }

    try {
      const trade = await this.deps.executeTradeUseCase.execute({
        walletId: this.preset.walletId,
        baseCurrency: pair.base,
        quoteCurrency: pair.quote,
        type,
        amount,
        price,
      });

      const newState: PositionState = {
        hasPosition: type === TradeType.BUY,
        entryPrice: type === TradeType.BUY ? price : 0,
        lastTradeAt: Date.now(),
      };
      this.positions.set(pairKey, newState);

      this.logger.debug(
        `${type} ${amount.toFixed(6)} ${pair.base}/${pair.quote} @ ${price} -> trade ${trade.id}`,
      );

      this.deps.gateway.emitTradeExecuted(trade, this.preset.id);

      const portfolio = await this.deps.getPortfolioUseCase.execute(
        this.preset.walletId,
        this.preset.initialCapital,
      );
      this.deps.gateway.emitPortfolioUpdate(portfolio, this.preset.id);

      if (
        this.peakPortfolioValue === null ||
        portfolio.totalValueUsdt > this.peakPortfolioValue
      ) {
        this.peakPortfolioValue = portfolio.totalValueUsdt;
      }
    } catch (err) {
      this.logger.debug(
        `Trade skipped for ${pair.base}/${pair.quote}: ${String(err)}`,
      );
    }
  }
}
