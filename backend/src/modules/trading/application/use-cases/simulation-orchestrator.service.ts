import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { MARKET_DATA_PORT } from '../../domain/ports/market-data.port.js';
import type { PresetRecord } from '../../domain/ports/preset-repository.port.js';
import { ExecuteTradeUseCase } from './execute-trade.use-case.js';
import { GetPortfolioUseCase } from './get-portfolio.use-case.js';
import { TradingSignalService } from './trading-signal.service.js';
import { PresetService } from './preset.service.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { TradingGateway } from '../../infrastructure/ws/trading.gateway.js';
import {
  PresetSimulationRunner,
  type PresetSimulationRunnerDeps,
} from './preset-simulation-runner.js';
import type { PresetStateChangePayload } from '../../infrastructure/ws/trading.gateway.js';

@Injectable()
export class SimulationOrchestrator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationOrchestrator.name);
  private readonly runners = new Map<string, PresetSimulationRunner>();
  /** Reference count per pair symbol: how many active runners subscribe to it */
  private readonly pairRefCount = new Map<string, number>();

  constructor(
    private readonly presetService: PresetService,
    private readonly executeTradeUseCase: ExecuteTradeUseCase,
    private readonly getPortfolioUseCase: GetPortfolioUseCase,
    private readonly gateway: TradingGateway,
    private readonly tradingSignalService: TradingSignalService,
    @Inject(MARKET_DATA_PORT) private readonly marketData: MarketDataPort,
  ) {}

  async onModuleInit(): Promise<void> {
    const activePresets = await this.presetService.getActive();
    for (const preset of activePresets) {
      this.startRunner(preset);
    }

    this.presetService.onPresetChange((preset, event) => {
      switch (event) {
        case 'activated':
          this.startRunner(preset);
          break;
        case 'paused':
        case 'archived':
          this.stopRunner(preset.id);
          break;
        case 'config_updated':
          this.runners.get(preset.id)?.updatePreset(preset);
          this.refreshPairSubscriptions();
          break;
      }
      this.gateway.emitPresetStateChange({
        presetId: preset.id,
        name: preset.name,
        status: preset.status,
        event,
        timestamp: new Date().toISOString(),
      } satisfies PresetStateChangePayload);
    });

    this.logger.log(
      `Orchestrator ready — ${this.runners.size} runner(s) started`,
    );
  }

  onModuleDestroy(): void {
    for (const runner of this.runners.values()) {
      runner.stop();
    }
    this.runners.clear();
    this.pairRefCount.clear();
    this.logger.log('All simulation runners stopped');
  }

  /** Backward-compat: returns walletId of the specified preset or the first active runner */
  getSimulationWalletId(presetId?: string): string | null {
    if (presetId) {
      return this.runners.get(presetId)?.walletId ?? null;
    }
    const first = this.runners.values().next().value as PresetSimulationRunner | undefined;
    return first?.walletId ?? null;
  }

  /** Returns the max drawdown fraction (0–1) observed for the given runner, or 0 if not running */
  getRunnerMaxDrawdown(presetId: string): number {
    return this.runners.get(presetId)?.maxDrawdown ?? 0;
  }

  /** Returns true if there is an active runner for the given preset */
  isRunnerActive(presetId: string): boolean {
    return this.runners.has(presetId);
  }

  private startRunner(preset: PresetRecord): void {
    if (this.runners.has(preset.id)) {
      this.logger.warn(`Runner for preset "${preset.name}" already exists — skipping`);
      return;
    }

    const deps: PresetSimulationRunnerDeps = {
      executeTradeUseCase: this.executeTradeUseCase,
      getPortfolioUseCase: this.getPortfolioUseCase,
      gateway: this.gateway,
      tradingSignalService: this.tradingSignalService,
      marketData: this.marketData,
    };

    const runner = new PresetSimulationRunner(preset, deps);
    this.runners.set(preset.id, runner);
    runner.start();

    // Subscribe to WS price stream for pairs this runner needs
    for (const symbol of runner.activePairSymbols) {
      const count = this.pairRefCount.get(symbol) ?? 0;
      if (count === 0) {
        this.subscribeSymbol(symbol, preset);
      }
      this.pairRefCount.set(symbol, count + 1);
    }

    this.logger.log(`Runner started for preset "${preset.name}" (${preset.id})`);
  }

  private stopRunner(presetId: string): void {
    const runner = this.runners.get(presetId);
    if (!runner) return;

    runner.stop();
    this.runners.delete(presetId);

    // Decrement WS ref counts; unsubscribe if no remaining runners need the pair
    for (const symbol of runner.activePairSymbols) {
      const count = (this.pairRefCount.get(symbol) ?? 1) - 1;
      if (count <= 0) {
        this.pairRefCount.delete(symbol);
        const [base, quote] = this.symbolToPair(symbol);
        if (base && quote) {
          this.marketData.unsubscribe(CryptoPair.create(base, quote));
        }
      } else {
        this.pairRefCount.set(symbol, count);
      }
    }

    this.logger.log(`Runner stopped for preset ${presetId}`);
  }

  /**
   * Recompute WS subscriptions after a config_updated event.
   * Subscribes new pairs, unsubscribes pairs no longer used by any runner.
   */
  private refreshPairSubscriptions(): void {
    const needed = new Map<string, PresetRecord>();
    for (const runner of this.runners.values()) {
      for (const symbol of runner.activePairSymbols) {
        if (!needed.has(symbol)) {
          // Find the preset to get CryptoPair split — use a placeholder
          needed.set(symbol, { activePairs: runner.activePairSymbols } as unknown as PresetRecord);
        }
      }
    }

    // Subscribe new pairs
    for (const symbol of needed.keys()) {
      if (!this.pairRefCount.has(symbol)) {
        const [base, quote] = this.symbolToPair(symbol);
        if (base && quote) {
          const pair = CryptoPair.create(base, quote);
          this.marketData.subscribeToPrice(pair, (price) => {
            this.gateway.emitPriceUpdate(price.pair.toSymbol(), price.value, new Date());
          });
          this.pairRefCount.set(symbol, 1);
        }
      }
    }

    // Unsubscribe pairs no longer needed
    for (const symbol of this.pairRefCount.keys()) {
      if (!needed.has(symbol)) {
        const [base, quote] = this.symbolToPair(symbol);
        if (base && quote) {
          this.marketData.unsubscribe(CryptoPair.create(base, quote));
        }
        this.pairRefCount.delete(symbol);
      }
    }
  }

  private subscribeSymbol(symbol: string, _preset: PresetRecord): void {
    const [base, quote] = this.symbolToPair(symbol);
    if (!base || !quote) return;
    const pair = CryptoPair.create(base, quote);
    this.marketData.subscribeToPrice(pair, (price) => {
      this.gateway.emitPriceUpdate(price.pair.toSymbol(), price.value, new Date());
    });
  }

  /**
   * Convert a concatenated symbol like 'BTCUSDT' back to [base, quote].
   * Tries known quote currencies in order of precedence.
   */
  private symbolToPair(symbol: string): [string, string] | [null, null] {
    const knownQuotes = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB', 'USDC'];
    for (const quote of knownQuotes) {
      if (symbol.endsWith(quote) && symbol.length > quote.length) {
        return [symbol.slice(0, -quote.length), quote];
      }
    }
    return [null, null];
  }
}
