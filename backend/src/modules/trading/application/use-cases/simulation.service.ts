import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import type { WalletRepositoryPort } from '../../domain/ports/wallet-repository.port.js';
import { WALLET_REPOSITORY } from '../../domain/ports/wallet-repository.port.js';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { MARKET_DATA_PORT } from '../../domain/ports/market-data.port.js';
import { ExecuteTradeUseCase } from './execute-trade.use-case.js';
import { GetPortfolioUseCase } from './get-portfolio.use-case.js';
import { TradingSignalService } from './trading-signal.service.js';
import { PresetService } from './preset.service.js';
import { TradeType } from '../../domain/enums.js';
import { Wallet } from '../../domain/entities/wallet.entity.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { TradingGateway } from '../../infrastructure/ws/trading.gateway.js';
import { Timeframe } from '../../../research/domain/enums.js';

const SIMULATION_WALLET_OWNER = 'simulation-bot';

interface PositionState {
  hasPosition: boolean;
  entryPrice: number;
  lastTradeAt: number;
}

@Injectable()
export class SimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private walletId: string | null = null;
  private readonly positions = new Map<string, PositionState>();
  private peakPortfolioValue: number | null = null;
  private tradingPaused = false;

  constructor(
    private readonly executeTradeUseCase: ExecuteTradeUseCase,
    private readonly getPortfolioUseCase: GetPortfolioUseCase,
    private readonly gateway: TradingGateway,
    private readonly tradingSignalService: TradingSignalService,
    private readonly presetService: PresetService,
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(MARKET_DATA_PORT) private readonly marketData: MarketDataPort,
  ) {}

  getSimulationWalletId(): string | null {
    return this.walletId;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSimulationWallet();
    this.subscribeLivePrices();
    this.start();

    // React to config changes
    this.presetService.onConfigChange((cfg) => {
      this.logger.log('Config changed, restarting simulation interval...');
      this.stop();
      this.subscribeLivePrices();
      this.start();
      // If modelSnapshotId changed, reload the model
      if (cfg.modelSnapshotId !== 'latest') {
        void this.tradingSignalService.loadModel(cfg.modelSnapshotId);
      } else {
        void this.tradingSignalService.tryLoadLatestModel();
      }
    });
  }

  onModuleDestroy(): void {
    this.stop();
  }

  private async ensureSimulationWallet(): Promise<void> {
    let wallet = await this.walletRepo.findByOwnerId(SIMULATION_WALLET_OWNER);
    if (!wallet) {
      wallet = Wallet.create(SIMULATION_WALLET_OWNER);
      await this.walletRepo.save(wallet);
      this.logger.log(`Created simulation wallet: ${wallet.id.value}`);
    }
    this.walletId = wallet.id.value;
    this.logger.log(`Simulation wallet ready: ${this.walletId}`);
  }

  start(): void {
    if (this.intervalHandle) return;
    const cfg = this.presetService.getConfigForSimulation();
    this.logger.log(`Starting ML-driven simulation every ${cfg.pollingIntervalMs}ms`);
    this.intervalHandle = setInterval(() => void this.runSimulationTick(), cfg.pollingIntervalMs);
  }

  private subscribeLivePrices(): void {
    const cfg = this.presetService.getConfigForSimulation();
    const pairs = cfg.activePairs.map((p) => {
      const [base, quote] = p.split('/');
      return { base: base!, quote: quote! };
    });
    for (const pair of pairs) {
      const cryptoPair = CryptoPair.create(pair.base, pair.quote);
      this.marketData.subscribeToPrice(cryptoPair, (price) => {
        this.gateway.emitPriceUpdate(price.pair.toSymbol(), price.value, new Date());
      });
    }
    this.logger.log('Subscribed to live price streams for all simulated pairs');
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log('Simulation stopped');
    }
  }

  private async runSimulationTick(): Promise<void> {
    if (!this.walletId) return;

    if (!this.tradingSignalService.isModelReady) {
      this.logger.debug('No ML model loaded — simulation tick skipped');
      return;
    }

    const cfg = this.presetService.getConfigForSimulation();

    // Check max drawdown pause
    if (cfg.maxDrawdownPct !== null && this.peakPortfolioValue !== null) {
      try {
        const portfolio = await this.getPortfolioUseCase.execute(this.walletId);
        const totalValue = portfolio.totalValueUsdt;
        if (totalValue > this.peakPortfolioValue) {
          this.peakPortfolioValue = totalValue;
          this.tradingPaused = false;
        }
        const drawdown = (this.peakPortfolioValue - totalValue) / this.peakPortfolioValue;
        if (drawdown >= cfg.maxDrawdownPct) {
          if (!this.tradingPaused) {
            this.logger.warn(`Max drawdown ${(drawdown * 100).toFixed(2)}% reached — trading paused`);
            this.tradingPaused = true;
          }
          return;
        }
        this.tradingPaused = false;
      } catch {
        // Portfolio fetch failed, continue
      }
    }

    const pairs = cfg.activePairs.map((p) => {
      const [base, quote] = p.split('/');
      return { base: base!, quote: quote! };
    });

    for (const pair of pairs) {
      await this.processPair(pair);
    }
  }

  private async processPair(pair: { base: string; quote: string }): Promise<void> {
    if (!this.walletId) return;

    const cfg = this.presetService.getConfigForSimulation();
    const pairKey = `${pair.base}${pair.quote}`;
    const posState = this.positions.get(pairKey) ?? { hasPosition: false, entryPrice: 0, lastTradeAt: 0 };

    // Cooldown check
    if (cfg.cooldownMs > 0 && Date.now() - posState.lastTradeAt < cfg.cooldownMs) return;

    // Get real price
    let price: number;
    try {
      const cryptoPair = CryptoPair.create(pair.base, pair.quote);
      const live = await this.marketData.getCurrentPrice(cryptoPair);
      price = live.value;
    } catch {
      return;
    }

    // Check stop-loss / take-profit on open positions
    if (posState.hasPosition && posState.entryPrice > 0) {
      const pricePct = (price - posState.entryPrice) / posState.entryPrice;

      const shouldStopLoss = cfg.stopLossPct !== null && pricePct <= -cfg.stopLossPct;
      const shouldTakeProfit = cfg.takeProfitPct !== null && pricePct >= cfg.takeProfitPct;

      if (shouldStopLoss || shouldTakeProfit) {
        const reason = shouldStopLoss ? 'STOP-LOSS' : 'TAKE-PROFIT';
        this.logger.log(`${reason} triggered for ${pairKey}: entry=${posState.entryPrice.toFixed(2)} current=${price.toFixed(2)} (${(pricePct * 100).toFixed(2)}%)`);
        await this.executeTrade(pair, TradeType.SELL, price, pairKey, posState);
        return;
      }
    }

    // Get timeframe from config
    const timeframeStr = cfg.signalTimeframe;
    const timeframe = (Object.values(Timeframe) as string[]).includes(timeframeStr)
      ? (timeframeStr as Timeframe)
      : Timeframe.FIVE_MINUTES;

    // Get ML signal
    const signal = await this.tradingSignalService.getSignal(pair, timeframe);

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
    if (!this.walletId) return;

    const cfg = this.presetService.getConfigForSimulation();

    let amount: number;
    if (cfg.positionMode === 'percent') {
      try {
        const portfolio = await this.getPortfolioUseCase.execute(this.walletId);
        amount = (portfolio.totalValueUsdt * cfg.positionSizePct) / price;
        amount = Math.max(amount, 0.00001);
      } catch {
        amount = cfg.fixedAmount;
      }
    } else {
      amount = cfg.fixedAmount;
    }

    try {
      const trade = await this.executeTradeUseCase.execute({
        walletId: this.walletId,
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

      this.gateway.emitTradeExecuted(trade);

      const portfolio = await this.getPortfolioUseCase.execute(this.walletId);
      this.gateway.emitPortfolioUpdate(portfolio);

      // Track peak portfolio value for drawdown calculation
      if (this.peakPortfolioValue === null || portfolio.totalValueUsdt > this.peakPortfolioValue) {
        this.peakPortfolioValue = portfolio.totalValueUsdt;
      }
    } catch (err) {
      this.logger.debug(`Simulation tick skipped for ${pair.base}/${pair.quote}: ${String(err)}`);
    }
  }
}
