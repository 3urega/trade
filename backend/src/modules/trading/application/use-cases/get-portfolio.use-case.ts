import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UseCase } from '../../../../shared/application/use-case.interface.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import type { WalletRepositoryPort } from '../../domain/ports/wallet-repository.port.js';
import { WALLET_REPOSITORY } from '../../domain/ports/wallet-repository.port.js';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { MARKET_DATA_PORT } from '../../domain/ports/market-data.port.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { PortfolioResponseDto } from '../dtos/portfolio-response.dto.js';

@Injectable()
export class GetPortfolioUseCase implements UseCase<string, PortfolioResponseDto> {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(MARKET_DATA_PORT) private readonly marketData: MarketDataPort,
  ) {}

  async execute(walletId: string): Promise<PortfolioResponseDto> {
    const wallet = await this.walletRepo.findById(new UniqueEntityId(walletId));
    if (!wallet) throw new NotFoundException(`Wallet ${walletId} not found`);

    const balances = wallet.getBalances();
    const currentPrices = new Map<string, number>();

    for (const [currency] of balances) {
      if (currency === 'USDT') continue;
      try {
        const pair = CryptoPair.create(currency, 'USDT');
        const price = await this.marketData.getCurrentPrice(pair);
        currentPrices.set(currency, price.value);
      } catch {
        currentPrices.set(currency, 0);
      }
    }

    return PortfolioResponseDto.fromDomain(wallet, currentPrices);
  }
}
