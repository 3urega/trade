import { CryptoPair } from '../value-objects/crypto-pair.js';
import { Price } from '../value-objects/price.js';
import { Candle } from '../../../research/domain/value-objects/candle.js';
import { Timeframe } from '../../../research/domain/enums.js';

export interface MarketDataPort {
  getCurrentPrice(pair: CryptoPair): Promise<Price>;
  getHistoricalPrices(pair: CryptoPair, from: Date, to: Date): Promise<Price[]>;
  getRecentCandles(pair: CryptoPair, timeframe: Timeframe, limit: number): Promise<Candle[]>;
  subscribeToPrice(pair: CryptoPair, callback: (price: Price) => void): void;
  unsubscribe(pair: CryptoPair): void;
}

export const MARKET_DATA_PORT = Symbol('MARKET_DATA_PORT');
