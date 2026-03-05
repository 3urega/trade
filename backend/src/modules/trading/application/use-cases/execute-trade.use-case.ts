import { Inject, Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { UseCase } from '../../../../shared/application/use-case.interface.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import type { TradeRepositoryPort } from '../../domain/ports/trade-repository.port.js';
import { TRADE_REPOSITORY } from '../../domain/ports/trade-repository.port.js';
import type { WalletRepositoryPort } from '../../domain/ports/wallet-repository.port.js';
import { WALLET_REPOSITORY } from '../../domain/ports/wallet-repository.port.js';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { MARKET_DATA_PORT } from '../../domain/ports/market-data.port.js';
import { Trade } from '../../domain/entities/trade.entity.js';
import { Money } from '../../domain/value-objects/money.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { TradeType } from '../../domain/enums.js';
import { ExecuteTradeDto } from '../dtos/execute-trade.dto.js';
import { TradeResponseDto } from '../dtos/trade-response.dto.js';

@Injectable()
export class ExecuteTradeUseCase implements UseCase<ExecuteTradeDto, TradeResponseDto> {
  private readonly logger = new Logger(ExecuteTradeUseCase.name);

  constructor(
    @Inject(TRADE_REPOSITORY) private readonly tradeRepo: TradeRepositoryPort,
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(MARKET_DATA_PORT) private readonly marketData: MarketDataPort,
  ) {}

  async execute(request: ExecuteTradeDto): Promise<TradeResponseDto> {
    const walletId = new UniqueEntityId(request.walletId);
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) throw new NotFoundException(`Wallet ${request.walletId} not found`);

    const pair = CryptoPair.create(request.baseCurrency, request.quoteCurrency);

    let priceValue: number;
    if (request.price !== undefined) {
      priceValue = request.price;
    } else {
      const livePrice = await this.marketData.getCurrentPrice(pair);
      priceValue = livePrice.value;
    }

    const price = Money.create(priceValue, pair.quote);
    const type = request.type as TradeType;

    const tradeResult = Trade.create(walletId, pair, type, request.amount, price);
    if (tradeResult.isFailure) {
      throw new BadRequestException(tradeResult.getError().message);
    }
    const trade = tradeResult.getValue();

    const applyResult = wallet.applyTrade(trade);
    if (applyResult.isFailure) {
      throw new BadRequestException(applyResult.getError().message);
    }

    await this.tradeRepo.save(trade);
    await this.walletRepo.save(wallet);

    this.logger.log(`Trade executed: ${type} ${request.amount} ${pair.toString()} @ ${priceValue}`);

    return TradeResponseDto.fromDomain(trade);
  }
}
