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

// --- Research / Backtest types ---

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type ModelType = 'sgd_regressor' | 'passive_aggressive';
export type BacktestStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface BacktestMetrics {
  mae: number;
  mse: number;
  rmse: number;
  directionalAccuracy: number;
  totalPredictions: number;
}

export interface PredictionRecord {
  id: string;
  timestamp: string;
  predicted: number;
  actual: number;
  absoluteError: number;
  directionCorrect: boolean;
}

export interface BacktestSession {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  modelType: ModelType;
  warmupPeriod: number;
  status: BacktestStatus;
  metrics: BacktestMetrics;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  predictions?: PredictionRecord[];
}

export interface LoadCandlesResult {
  symbol: string;
  timeframe: string;
  from: string;
  to: string;
  loaded: number;
}
