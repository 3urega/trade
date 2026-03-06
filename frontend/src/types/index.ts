export interface Trade {
  id: string;
  walletId: string;
  /** Optional: set when the trade was executed by a specific preset's runner */
  presetId?: string;
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
  /** USDT value of this position at current market price */
  valueUsdt: number;
  /** Percentage of total portfolio */
  pct: number;
}

export interface Portfolio {
  walletId: string;
  /** Optional: set when the update originated from a specific preset's runner */
  presetId?: string;
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
export type ModelType = 'sgd_regressor' | 'passive_aggressive' | 'mlp_regressor' | 'ensemble';
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
  reason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_TEST';
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
  profitFactor: number;
  avgTrade: number;
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
  predictionCorrelation?: number;
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

// --- Preset types ---

export type PresetStatus = 'active' | 'paused' | 'archived';

export interface PresetConfig {
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

export interface Preset {
  id: string;
  name: string;
  walletId: string;
  status: PresetStatus;
  initialCapital: number;
  config: PresetConfig;
  createdAt: string;
  updatedAt: string;
}

/** On-the-fly performance metrics for a single preset */
export interface PresetMetrics {
  presetId: string;
  name: string;
  status: PresetStatus;
  walletId: string;
  initialCapital: number;
  totalValueUsdt: number;
  pnl: number;
  pnlPercent: number;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  /** null when no completed BUY→SELL round-trips exist yet */
  winRate: number | null;
  /** Maximum observed drawdown as a fraction 0–1 */
  maxDrawdown: number;
  balances: BalanceEntry[];
  isRunning: boolean;
}

export type PresetChangeEvent = 'activated' | 'paused' | 'archived' | 'config_updated';

/** Payload of the `preset_state_change` WebSocket event */
export interface PresetStateChange {
  presetId: string;
  name: string;
  status: PresetStatus;
  event: PresetChangeEvent;
  timestamp: string;
}

/** Input shape for creating a preset */
export interface CreatePresetInput {
  name: string;
  initialCapital?: number;
  modelSnapshotId?: string;
  signalThreshold?: number;
  positionMode?: 'fixed' | 'percent';
  fixedAmount?: number;
  positionSizePct?: number;
  activePairs?: string[];
  signalTimeframe?: string;
  pollingIntervalMs?: number;
  cooldownMs?: number;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  maxDrawdownPct?: number | null;
}

/** Input shape for updating a preset */
export type UpdatePresetInput = Partial<CreatePresetInput> & {
  status?: PresetStatus;
};

// --- Research Experiments (scheduler) ---

export type ExperimentRunStatus = 'SUCCESS' | 'FAILED' | 'RUNNING';

export interface ResearchExperiment {
  id: string;
  name: string;
  symbol: string;
  timeframe: Timeframe;
  modelType: ModelType;
  warmupPeriod: number;
  trainWindowDays: number;
  forwardWindowDays: number;
  initialCapital: number;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: ExperimentRunStatus | null;
  lastBacktestSessionId: string | null;
  lastForwardSessionId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExperimentInput {
  name: string;
  symbol: string;
  timeframe: Timeframe;
  modelType: ModelType;
  warmupPeriod?: number;
  trainWindowDays?: number;
  forwardWindowDays?: number;
  initialCapital?: number;
}
