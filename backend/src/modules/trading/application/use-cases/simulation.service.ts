import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import type { WalletRepositoryPort } from '../../domain/ports/wallet-repository.port.js';
import { WALLET_REPOSITORY } from '../../domain/ports/wallet-repository.port.js';
import { ExecuteTradeUseCase } from './execute-trade.use-case.js';
import { TradeType } from '../../domain/enums.js';
import { Wallet } from '../../domain/entities/wallet.entity.js';

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
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
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

    // Simulated price ranges per asset
    const priceRanges: Record<string, [number, number]> = {
      BTC: [55000, 75000],
      ETH: [2500, 4000],
      SOL: [120, 220],
    };
    const [min, max] = priceRanges[pair.base] ?? [100, 1000];
    const price = parseFloat((Math.random() * (max - min) + min).toFixed(2));
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
    } catch (err) {
      // Low balance is expected during simulation, skip silently
      this.logger.debug(`Simulation tick skipped: ${String(err)}`);
    }
  }
}
