import type { Trade, Portfolio } from '../types/index.ts';

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
