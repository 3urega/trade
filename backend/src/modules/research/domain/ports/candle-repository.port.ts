import { Candle } from '../value-objects/candle.js';
import { Timeframe } from '../enums.js';

export const CANDLE_REPOSITORY = Symbol('CANDLE_REPOSITORY');

export interface CandleDatasetSummary {
  symbol: string;
  timeframe: string;
  start: Date;
  end: Date;
  count: number;
}

export interface CandleRepositoryPort {
  saveBatch(candles: Candle[]): Promise<void>;
  findBySymbolAndRange(symbol: string, from: Date, to: Date, timeframe: Timeframe): Promise<Candle[]>;
  findBySymbolAndRangeWithLimit(symbol: string, timeframe: Timeframe, from?: Date, to?: Date, limit?: number): Promise<Candle[]>;
  countBySymbolAndRange(symbol: string, from: Date, to: Date, timeframe: Timeframe): Promise<number>;
  getSummary(): Promise<CandleDatasetSummary[]>;
}
