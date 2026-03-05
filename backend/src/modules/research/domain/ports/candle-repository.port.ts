import { Candle } from '../value-objects/candle.js';
import { Timeframe } from '../enums.js';

export const CANDLE_REPOSITORY = Symbol('CANDLE_REPOSITORY');

export interface CandleRepositoryPort {
  saveBatch(candles: Candle[]): Promise<void>;
  findBySymbolAndRange(symbol: string, from: Date, to: Date, timeframe: Timeframe): Promise<Candle[]>;
  countBySymbolAndRange(symbol: string, from: Date, to: Date, timeframe: Timeframe): Promise<number>;
}
