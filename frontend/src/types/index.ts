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
export type SessionType = 'BACKTEST' | 'FORWARD_TEST';

export interface BacktestMetrics {
  // Price-space
  mae: number;
  mse: number;
  rmse: number;
  mape: number;
  // Return-space
  maeReturn: number;
  rmseReturn: number;
  // Direction
  directionalAccuracy: number;
  totalPredictions: number;
  // Baseline & finance
  maeNaive: number;
  skillScore: number;
  sharpeRatio: number;
}

export interface PredictionRecord {
  id: string;
  timestamp: string;
  predicted: number;
  actual: number;
  absoluteError: number;
  directionCorrect: boolean;
}

export interface SimTrade {
  type: 'BUY' | 'SELL';
  price: number;
  qty: number;
  fee: number;
  pnl: number;
  time: string;
}

export interface EquityPoint {
  time: string;
  equity: number;
}

export interface TradingMetrics {
  initialCapital: number;
  finalCapital: number;
  totalPnl: number;
  totalPnlPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  trades: SimTrade[];
  equityCurve: EquityPoint[];
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
  sessionType: SessionType;
  modelSnapshotId?: string;
  sourceSessionId?: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  predictions?: PredictionRecord[];
  tradingMetrics?: TradingMetrics;
}

export interface LoadCandlesResult {
  symbol: string;
  timeframe: string;
  from: string;
  to: string;
  loaded: number;
}

export interface CandleDatasetSummary {
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
  count: number;
}

export interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// --- Trading Config types ---

export interface TradingConfig {
  modelSnapshotId: string;
  signalThreshold: number;
  positionMode: 'fixed' | 'percent';
  fixedAmount: number;
  positionSizePct: number;
  activePairs: string[];
  signalTimeframe: string;
  pollingIntervalMs: number;
  cooldownMs: number;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  maxDrawdownPct: number | null;
}

export interface ForwardTestMetrics {
  sessionId: string;
  from: string;
  to: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPct: number;
  totalTrades: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface AvailableModel {
  snapshotId: string;
  backtestSessionId: string;
  symbol: string;
  timeframe: string;
  modelType: string;
  trainedAt: string;
  skillScore?: number;
  directionalAccuracy?: number;
  forwardTests: ForwardTestMetrics[];
}
