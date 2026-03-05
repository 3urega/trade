import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Candle } from '../../domain/value-objects/candle.js';
import { Timeframe } from '../../domain/enums.js';

const BINANCE_REST = 'https://api.binance.com/api/v3';
const BINANCE_KLINE_LIMIT = 1000;

// Binance kline tuple: [openTime, open, high, low, close, volume, ...]
type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

@Injectable()
export class BinanceCandleAdapter {
  private readonly logger = new Logger(BinanceCandleAdapter.name);

  async fetchCandles(
    symbol: string,
    timeframe: Timeframe,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    const allCandles: Candle[] = [];
    let startTime = from.getTime();
    const endTime = to.getTime();

    // Paginate: Binance returns max 1000 candles per request
    while (startTime < endTime) {
      const batch = await this.fetchBatch(symbol, timeframe, startTime, endTime);
      if (batch.length === 0) break;

      allCandles.push(...batch);
      const lastOpenTime = batch[batch.length - 1].openTime.getTime();
      startTime = lastOpenTime + 1;

      if (batch.length < BINANCE_KLINE_LIMIT) break;
    }

    return allCandles;
  }

  private async fetchBatch(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
  ): Promise<Candle[]> {
    try {
      const { data } = await axios.get<BinanceKline[]>(`${BINANCE_REST}/klines`, {
        params: {
          symbol: symbol.toUpperCase(),
          interval: timeframe,
          startTime,
          endTime,
          limit: BINANCE_KLINE_LIMIT,
        },
        timeout: 15000,
      });

      return data.map(([openTime, open, high, low, close, volume]) =>
        Candle.create(
          symbol,
          timeframe,
          new Date(openTime),
          parseFloat(open),
          parseFloat(high),
          parseFloat(low),
          parseFloat(close),
          parseFloat(volume),
        ),
      );
    } catch (err) {
      this.logger.error(`Binance klines fetch failed for ${symbol} ${timeframe}: ${String(err)}`);
      throw new Error(`Failed to fetch candles from Binance: ${String(err)}`);
    }
  }
}
