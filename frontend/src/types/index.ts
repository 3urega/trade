export interface Trade {
  id: string;
  walletId: string;
  pair: string;
  type: 'BUY' | 'SELL';
  amount: number;
  price: number;
  fee: number;
  totalCost: number;
  status: string;
  executedAt: string;
}

export interface BalanceEntry {
  currency: string;
  amount: number;
}

export interface Portfolio {
  walletId: string;
  balances: BalanceEntry[];
  totalValueUsdt: number;
  pnl: number;
  pnlPercent: number;
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: string;
}
