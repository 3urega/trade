import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import WebSocket from 'ws';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { Price } from '../../domain/value-objects/price.js';
import { Candle } from '../../../../modules/research/domain/value-objects/candle.js';
import { Timeframe } from '../../../../modules/research/domain/enums.js';
import { MockMarketAdapter } from './mock-market.adapter.js';

const BINANCE_REST = 'https://api.binance.com/api/v3';
const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  [Timeframe.ONE_MINUTE]: '1m',
  [Timeframe.FIVE_MINUTES]: '5m',
  [Timeframe.FIFTEEN_MINUTES]: '15m',
  [Timeframe.ONE_HOUR]: '1h',
  [Timeframe.FOUR_HOURS]: '4h',
  [Timeframe.ONE_DAY]: '1d',
};

@Injectable()
export class BinanceMarketAdapter implements MarketDataPort, OnModuleDestroy {
  private readonly logger = new Logger(BinanceMarketAdapter.name);
  private readonly fallback = new MockMarketAdapter();
  private readonly wsSockets = new Map<string, WebSocket>();
  /** Fan-out: multiple callbacks per symbol (e.g. multiple presets watching the same pair) */
  private readonly wsCallbacks = new Map<string, Array<(price: Price) => void>>();

  async getCurrentPrice(pair: CryptoPair): Promise<Price> {
    try {
      const { data } = await axios.get<{ price: string }>(
        `${BINANCE_REST}/ticker/price?symbol=${pair.toSymbol()}`,
        { timeout: 5000 },
      );
      return Price.create(pair, parseFloat(data.price));
    } catch (err) {
      this.logger.warn(`Binance REST unavailable for ${pair.toSymbol()}, using mock: ${String(err)}`);
      return this.fallback.getCurrentPrice(pair);
    }
  }

  async getHistoricalPrices(pair: CryptoPair, from: Date, to: Date): Promise<Price[]> {
    try {
      const { data } = await axios.get<[number, string, string, string, string][]>(
        `${BINANCE_REST}/klines`,
        {
          params: {
            symbol: pair.toSymbol(),
            interval: '1h',
            startTime: from.getTime(),
            endTime: to.getTime(),
            limit: 1000,
          },
          timeout: 10000,
        },
      );
      return data.map(([openTime, , , , closePrice]) =>
        Price.create(pair, parseFloat(closePrice), new Date(openTime)),
      );
    } catch (err) {
      this.logger.warn(`Binance klines unavailable for ${pair.toSymbol()}, using mock`);
      return this.fallback.getHistoricalPrices(pair, from, to);
    }
  }

  async getRecentCandles(pair: CryptoPair, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const interval = TIMEFRAME_MAP[timeframe] ?? '5m';
    try {
      const { data } = await axios.get<[number, string, string, string, string, string][]>(
        `${BINANCE_REST}/klines`,
        {
          params: { symbol: pair.toSymbol(), interval, limit },
          timeout: 8000,
        },
      );
      return data.map(([openTime, open, high, low, close, volume]) =>
        Candle.create(
          pair.toSymbol(),
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
      this.logger.warn(`Binance klines unavailable for ${pair.toSymbol()}, using mock: ${String(err)}`);
      return this.fallback.getRecentCandles(pair, timeframe, limit);
    }
  }

  subscribeToPrice(pair: CryptoPair, callback: (price: Price) => void): void {
    const symbol = pair.toSymbol().toLowerCase();
    const key = pair.toSymbol();

    // Always register the callback so multiple callers (presets) get updates for the same pair
    const callbacks = this.wsCallbacks.get(key) ?? [];
    callbacks.push(callback);
    this.wsCallbacks.set(key, callbacks);

    // Open the WS connection only once per symbol
    if (this.wsSockets.has(key)) return;

    const url = `${BINANCE_WS}/${symbol}@miniTicker`;
    const ws = new WebSocket(url);

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as { c: string };
        const price = Price.create(pair, parseFloat(msg.c));
        for (const cb of this.wsCallbacks.get(key) ?? []) {
          cb(price);
        }
      } catch { /* skip malformed frames */ }
    });

    ws.on('error', (err) => {
      this.logger.warn(`Binance WS error for ${key}: ${err.message}. Falling back to mock.`);
      ws.terminate();
      this.wsSockets.delete(key);
      // Fan-out the fallback subscription to all registered callbacks
      for (const cb of this.wsCallbacks.get(key) ?? []) {
        this.fallback.subscribeToPrice(pair, cb);
      }
    });

    ws.on('close', () => {
      this.wsSockets.delete(key);
    });

    this.wsSockets.set(key, ws);
    this.logger.log(`Subscribed to Binance WS: ${url}`);
  }

  unsubscribe(pair: CryptoPair): void {
    const key = pair.toSymbol();
    this.wsCallbacks.delete(key);
    const ws = this.wsSockets.get(key);
    if (ws) {
      ws.terminate();
      this.wsSockets.delete(key);
    }
    this.fallback.unsubscribe(pair);
  }

  onModuleDestroy(): void {
    for (const [key, ws] of this.wsSockets) {
      ws.terminate();
      this.logger.debug(`Closed Binance WS: ${key}`);
    }
    this.wsSockets.clear();
    this.wsCallbacks.clear();
  }
}
