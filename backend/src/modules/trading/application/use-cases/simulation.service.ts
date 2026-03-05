import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import type { WalletRepositoryPort } from '../../domain/ports/wallet-repository.port.js';
import { WALLET_REPOSITORY } from '../../domain/ports/wallet-repository.port.js';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { MARKET_DATA_PORT } from '../../domain/ports/market-data.port.js';
import { ExecuteTradeUseCase } from './execute-trade.use-case.js';
import { GetPortfolioUseCase } from './get-portfolio.use-case.js';
import { TradeType } from '../../domain/enums.js';
import { Wallet } from '../../domain/entities/wallet.entity.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { TradingGateway } from '../../infrastructure/ws/trading.gateway.js';

const SIMULATED_PAIRS = [
  { base: 'BTC', quote: 'USDT' },
  { base: 'ETH', quote: 'USDT' },
  { base: 'SOL', quote: 'USDT' },
];

const SIMULATION_INTERVAL_MS = 5000;
const SIMULATION_WALLET_OWNER = 'simulation-bot';

@Injectable()
export class SimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private walletId: string | null = null;

  constructor(
    private readonly executeTradeUseCase: ExecuteTradeUseCase,
    private readonly getPortfolioUseCase: GetPortfolioUseCase,
    private readonly gateway: TradingGateway,
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(MARKET_DATA_PORT) private readonly marketData: MarketDataPort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSimulationWallet();
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
    this.logger.log(`Starting auto-simulation every ${SIMULATION_INTERVAL_MS}ms`);
    this.intervalHandle = setInterval(() => void this.runSimulationTick(), SIMULATION_INTERVAL_MS);
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

    const pair = SIMULATED_PAIRS[Math.floor(Math.random() * SIMULATED_PAIRS.length)];
    const type = Math.random() > 0.5 ? TradeType.BUY : TradeType.SELL;

    // Precio real de Binance (mismo que portfolio y trade manual)
    let price: number;
    try {
      const cryptoPair = CryptoPair.create(pair.base, pair.quote);
      const live = await this.marketData.getCurrentPrice(cryptoPair);
      price = live.value;
    } catch {
      return; // Si Binance falla, no ejecutamos trade con precio inventado
    }

    const amount = parseFloat((Math.random() * 0.005 + 0.001).toFixed(6));

    try {
      const trade = await this.executeTradeUseCase.execute({
        walletId: this.walletId,
        baseCurrency: pair.base,
        quoteCurrency: pair.quote,
        type,
        amount,
        price,
      });
      this.logger.debug(`Simulated: ${type} ${amount} ${pair.base}/${pair.quote} @ ${price} -> trade ${trade.id}`);

      this.gateway.emitTradeExecuted(trade);

      const portfolio = await this.getPortfolioUseCase.execute(this.walletId);
      this.gateway.emitPortfolioUpdate(portfolio);
    } catch (err) {
      // Low balance is expected during simulation, skip silently
      this.logger.debug(`Simulation tick skipped: ${String(err)}`);
    }
  }
}
