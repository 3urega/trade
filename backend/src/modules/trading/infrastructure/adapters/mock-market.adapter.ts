import { Logger } from '@nestjs/common';
import type { MarketDataPort } from '../../domain/ports/market-data.port.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { Price } from '../../domain/value-objects/price.js';

const BASE_PRICES: Record<string, number> = {
  BTC: 65000,
  ETH: 3200,
  SOL: 165,
  BNB: 580,
  ADA: 0.45,
};

const VOLATILITY = 0.02; // 2% max random swing per call

export class MockMarketAdapter implements MarketDataPort {
  private readonly logger = new Logger(MockMarketAdapter.name);
  private currentPrices = new Map<string, number>(Object.entries(BASE_PRICES));
  private readonly subscriptions = new Map<string, NodeJS.Timeout>();

  async getCurrentPrice(pair: CryptoPair): Promise<Price> {
    const base = pair.base;
    const current = this.currentPrices.get(base) ?? 100;
    const swing = (Math.random() - 0.5) * 2 * VOLATILITY;
    const newPrice = parseFloat((current * (1 + swing)).toFixed(2));
    this.currentPrices.set(base, newPrice);
    return Price.create(pair, newPrice);
  }

  async getHistoricalPrices(pair: CryptoPair, from: Date, to: Date): Promise<Price[]> {
    const base = pair.base;
    const basePrice = BASE_PRICES[base] ?? 100;
    const points: Price[] = [];
    const intervalMs = 3600000; // 1h candles
    let ts = from.getTime();
    let price = basePrice;

    while (ts <= to.getTime()) {
      const swing = (Math.random() - 0.5) * 2 * VOLATILITY;
      price = parseFloat((price * (1 + swing)).toFixed(2));
      points.push(Price.create(pair, price, new Date(ts)));
      ts += intervalMs;
    }
    return points;
  }

  subscribeToPrice(pair: CryptoPair, callback: (price: Price) => void): void {
    const key = pair.toSymbol();
    if (this.subscriptions.has(key)) return;

    const handle = setInterval(async () => {
      const price = await this.getCurrentPrice(pair);
      callback(price);
    }, 3000);

    this.subscriptions.set(key, handle);
    this.logger.debug(`Mock subscription started for ${key}`);
  }

  unsubscribe(pair: CryptoPair): void {
    const key = pair.toSymbol();
    const handle = this.subscriptions.get(key);
    if (handle) {
      clearInterval(handle);
      this.subscriptions.delete(key);
    }
  }
}
