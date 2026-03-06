import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchModule } from '../research/research.module.js';

// Infrastructure - Persistence
import { TradeOrmEntity } from './infrastructure/persistence/trade.orm-entity.js';
import { WalletOrmEntity } from './infrastructure/persistence/wallet.orm-entity.js';
import { TradeTypeOrmRepository } from './infrastructure/persistence/trade-typeorm.repository.js';
import { WalletTypeOrmRepository } from './infrastructure/persistence/wallet-typeorm.repository.js';

// Infrastructure - Adapters
import { BinanceMarketAdapter } from './infrastructure/adapters/binance-market.adapter.js';

// Infrastructure - WebSocket
import { TradingGateway } from './infrastructure/ws/trading.gateway.js';

// Infrastructure - HTTP
import { TradingController } from './infrastructure/http/trading.controller.js';

// Application - Use Cases
import { ExecuteTradeUseCase } from './application/use-cases/execute-trade.use-case.js';
import { GetPortfolioUseCase } from './application/use-cases/get-portfolio.use-case.js';
import { GetTradesUseCase } from './application/use-cases/get-trades.use-case.js';
import { CreateWalletUseCase } from './application/use-cases/create-wallet.use-case.js';
import { SimulationService } from './application/use-cases/simulation.service.js';
import { TradingSignalService } from './application/use-cases/trading-signal.service.js';

// Domain - Tokens
import { TRADE_REPOSITORY } from './domain/ports/trade-repository.port.js';
import { WALLET_REPOSITORY } from './domain/ports/wallet-repository.port.js';
import { MARKET_DATA_PORT } from './domain/ports/market-data.port.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TradeOrmEntity, WalletOrmEntity]),
    ResearchModule,
  ],
  controllers: [TradingController],
  providers: [
    // Repository bindings (ports → implementations)
    { provide: TRADE_REPOSITORY, useClass: TradeTypeOrmRepository },
    { provide: WALLET_REPOSITORY, useClass: WalletTypeOrmRepository },
    { provide: MARKET_DATA_PORT, useClass: BinanceMarketAdapter },

    // Use Cases
    ExecuteTradeUseCase,
    GetPortfolioUseCase,
    GetTradesUseCase,
    CreateWalletUseCase,
    TradingSignalService,
    SimulationService,

    // WebSocket Gateway
    TradingGateway,

    // Market Adapter (also registered directly for OnModuleDestroy lifecycle)
    BinanceMarketAdapter,
  ],
  exports: [TradingGateway],
})
export class TradingModule {}
