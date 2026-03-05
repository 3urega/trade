export { TradeType, TradeStatus, SignalType } from './enums.js';

export { DomainError, InsufficientFundsError, InvalidTradeAmountError, InvalidPriceError, WalletNotFoundError } from './errors/domain-error.js';

export { CryptoPair } from './value-objects/crypto-pair.js';
export { Money } from './value-objects/money.js';
export { Price } from './value-objects/price.js';
export { TradeSignal } from './value-objects/trade-signal.js';

export { Trade } from './entities/trade.entity.js';
export { Wallet } from './entities/wallet.entity.js';

export { TradeExecutedEvent } from './events/trade-executed.event.js';
export { FundsDepositedEvent } from './events/funds-deposited.event.js';

export type { TradeRepositoryPort } from './ports/trade-repository.port.js';
export { TRADE_REPOSITORY } from './ports/trade-repository.port.js';
export type { WalletRepositoryPort } from './ports/wallet-repository.port.js';
export { WALLET_REPOSITORY } from './ports/wallet-repository.port.js';
export type { MarketDataPort } from './ports/market-data.port.js';
export { MARKET_DATA_PORT } from './ports/market-data.port.js';
