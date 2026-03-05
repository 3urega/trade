import type { Trade, Portfolio, BacktestSession, LoadCandlesResult, Timeframe, ModelType } from '../types/index.ts';

const BASE = '/v1';

export async function fetchTrades(walletId?: string, limit = 50): Promise<Trade[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (walletId) params.set('walletId', walletId);
  const res = await fetch(`${BASE}/trades?${params}`);
  if (!res.ok) throw new Error('Failed to fetch trades');
  return res.json() as Promise<Trade[]>;
}

export async function fetchPortfolio(walletId: string): Promise<Portfolio> {
  const res = await fetch(`${BASE}/portfolio/${walletId}`);
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json() as Promise<Portfolio>;
}

export async function executeTrade(payload: {
  walletId: string;
  baseCurrency: string;
  quoteCurrency: string;
  type: 'BUY' | 'SELL';
  amount: number;
  price?: number;
}): Promise<Trade> {
  const res = await fetch(`${BASE}/trades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json() as { message: string };
    throw new Error(err.message ?? 'Trade failed');
  }
  return res.json() as Promise<Trade>;
}

// --- Research API ---

export async function loadCandles(payload: {
  symbol: string;
  timeframe: Timeframe;
  from: string;
  to: string;
}): Promise<LoadCandlesResult> {
  const res = await fetch(`${BASE}/research/candles/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json() as { message: string };
    throw new Error(err.message ?? 'Failed to load candles');
  }
  return res.json() as Promise<LoadCandlesResult>;
}

export async function runBacktest(payload: {
  symbol: string;
  timeframe: Timeframe;
  from: string;
  to: string;
  modelType: ModelType;
  warmupPeriod: number;
}): Promise<BacktestSession> {
  const res = await fetch(`${BASE}/research/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json() as { message: string };
    throw new Error(err.message ?? 'Backtest failed');
  }
  return res.json() as Promise<BacktestSession>;
}

export async function fetchBacktests(): Promise<BacktestSession[]> {
  const res = await fetch(`${BASE}/research/backtest`);
  if (!res.ok) throw new Error('Failed to fetch backtests');
  return res.json() as Promise<BacktestSession[]>;
}

export async function fetchBacktest(id: string, withPredictions = false): Promise<BacktestSession> {
  const res = await fetch(`${BASE}/research/backtest/${id}?predictions=${withPredictions}`);
  if (!res.ok) throw new Error('Failed to fetch backtest');
  return res.json() as Promise<BacktestSession>;
}
