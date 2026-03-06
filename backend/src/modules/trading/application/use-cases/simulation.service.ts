import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import type { WalletRepositoryPort } from '../../domain/ports/wallet-repository.port.js';
import { WALLET_REPOSITORY } from '../../domain/ports/wallet-repository.port.js';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { MARKET_DATA_PORT } from '../../domain/ports/market-data.port.js';
import { ExecuteTradeUseCase } from './execute-trade.use-case.js';
import { GetPortfolioUseCase } from './get-portfolio.use-case.js';
import { TradingSignalService } from './trading-signal.service.js';
import { TradeType } from '../../domain/enums.js';
import { Wallet } from '../../domain/entities/wallet.entity.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { TradingGateway } from '../../infrastructure/ws/trading.gateway.js';
import { Timeframe } from '../../../research/domain/enums.js';

const SIMULATED_PAIRS = [
  { base: 'BTC', quote: 'USDT' },
  { base: 'ETH', quote: 'USDT' },
  { base: 'SOL', quote: 'USDT' },
];

const SIMULATION_INTERVAL_MS = 5000;
const SIMULATION_WALLET_OWNER = 'simulation-bot';

// Fixed trade amount per signal; adjust as needed
const FIXED_TRADE_AMOUNT = 0.001;

@Injectable()
export class SimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private walletId: string | null = null;

  constructor(
    private readonly executeTradeUseCase: ExecuteTradeUseCase,
    private readonly getPortfolioUseCase: GetPortfolioUseCase,
    private readonly gateway: TradingGateway,
    private readonly tradingSignalService: TradingSignalService,
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
    this.logger.log(`Starting ML-driven simulation every ${SIMULATION_INTERVAL_MS}ms`);
    this.intervalHandle = setInterval(() => void this.runSimulationTick(), SIMULATION_INTERVAL_MS);
  }

  private subscribeLivePrices(): void {
    for (const pair of SIMULATED_PAIRS) {
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

    for (const pair of SIMULATED_PAIRS) {
      await this.processPair(pair);
    }
  }

  private async processPair(pair: { base: string; quote: string }): Promise<void> {
    if (!this.walletId) return;

    // 1. Get ML signal for this pair
    const signal = await this.tradingSignalService.getSignal(pair, Timeframe.FIVE_MINUTES);

    // 2. Skip HOLD signals
    if (signal.isHold()) return;

    const type = signal.isBuy() ? TradeType.BUY : TradeType.SELL;

    // 3. Fetch real price from Binance
    let price: number;
    try {
      const cryptoPair = CryptoPair.create(pair.base, pair.quote);
      const live = await this.marketData.getCurrentPrice(cryptoPair);
      price = live.value;
    } catch {
      return; // Don't execute with a made-up price
    }

    // 4. Execute the trade
    try {
      const trade = await this.executeTradeUseCase.execute({
        walletId: this.walletId,
        baseCurrency: pair.base,
        quoteCurrency: pair.quote,
        type,
        amount: FIXED_TRADE_AMOUNT,
        price,
      });

      this.logger.debug(
        `ML signal: ${type} ${FIXED_TRADE_AMOUNT} ${pair.base}/${pair.quote} @ ${price} ` +
        `(confidence=${signal.confidence.toFixed(6)}) -> trade ${trade.id}`,
      );

      this.gateway.emitTradeExecuted(trade);

      const portfolio = await this.getPortfolioUseCase.execute(this.walletId);
      this.gateway.emitPortfolioUpdate(portfolio);
    } catch (err) {
      // Low balance is expected during simulation, skip silently
      this.logger.debug(`Simulation tick skipped for ${pair.base}/${pair.quote}: ${String(err)}`);
    }
  }
}
