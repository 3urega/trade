import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import WebSocket from 'ws';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { Price } from '../../domain/value-objects/price.js';
import { MockMarketAdapter } from './mock-market.adapter.js';

const BINANCE_REST = 'https://api.binance.com/api/v3';
const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

@Injectable()
export class BinanceMarketAdapter implements MarketDataPort, OnModuleDestroy {
  private readonly logger = new Logger(BinanceMarketAdapter.name);
  private readonly fallback = new MockMarketAdapter();
  private readonly wsSockets = new Map<string, WebSocket>();

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

  subscribeToPrice(pair: CryptoPair, callback: (price: Price) => void): void {
    const symbol = pair.toSymbol().toLowerCase();
    const key = pair.toSymbol();

    if (this.wsSockets.has(key)) return;

    const url = `${BINANCE_WS}/${symbol}@miniTicker`;
    const ws = new WebSocket(url);

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as { c: string };
        const price = Price.create(pair, parseFloat(msg.c));
        callback(price);
      } catch { /* skip malformed frames */ }
    });

    ws.on('error', (err) => {
      this.logger.warn(`Binance WS error for ${key}: ${err.message}. Falling back to mock.`);
      ws.terminate();
      this.wsSockets.delete(key);
      this.fallback.subscribeToPrice(pair, callback);
    });

    ws.on('close', () => {
      this.wsSockets.delete(key);
    });

    this.wsSockets.set(key, ws);
    this.logger.log(`Subscribed to Binance WS: ${url}`);
  }

  unsubscribe(pair: CryptoPair): void {
    const key = pair.toSymbol();
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
  }
}
