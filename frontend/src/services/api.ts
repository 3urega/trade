import type {
  Trade, Portfolio, BacktestSession, LoadCandlesResult, CandleDatasetSummary,
  CandleData, Timeframe, ModelType, TradingConfig, AvailableModel,
  Preset, PresetMetrics, CreatePresetInput, UpdatePresetInput,
} from '../types/index.ts';

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

export async function runForwardTest(payload: {
  backtestSessionId: string;
  from: string;
  to: string;
  initialCapital?: number;
  allowInSample?: boolean;
}): Promise<BacktestSession> {
  const res = await fetch(`${BASE}/research/forward-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json() as { message?: string | { message?: string } };
    const msg = typeof err.message === 'string' ? err.message : err.message?.message ?? 'Forward test failed';
    throw new Error(msg);
  }
  return res.json() as Promise<BacktestSession>;
}

export async function fetchSignalStatus(): Promise<{ modelReady: boolean }> {
  const res = await fetch(`${BASE}/trading/signal-status`);
  if (!res.ok) return { modelReady: false };
  return res.json() as Promise<{ modelReady: boolean }>;
}

export async function fetchTradingConfig(): Promise<TradingConfig> {
  const res = await fetch(`${BASE}/trading/config`);
  if (!res.ok) throw new Error('Failed to fetch trading config');
  return res.json() as Promise<TradingConfig>;
}

export async function updateTradingConfig(partial: Partial<TradingConfig>): Promise<TradingConfig> {
  const res = await fetch(`${BASE}/trading/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const err = await res.json() as { message?: string };
    throw new Error(err.message ?? 'Failed to update trading config');
  }
  return res.json() as Promise<TradingConfig>;
}

export async function fetchAvailableModels(): Promise<AvailableModel[]> {
  const res = await fetch(`${BASE}/trading/available-models`);
  if (!res.ok) throw new Error('Failed to fetch available models');
  return res.json() as Promise<AvailableModel[]>;
}

// --- Preset API ---

export async function fetchPresets(): Promise<Preset[]> {
  const res = await fetch(`${BASE}/trading/presets`);
  if (!res.ok) throw new Error('Failed to fetch presets');
  return res.json() as Promise<Preset[]>;
}

export async function fetchPreset(id: string): Promise<Preset> {
  const res = await fetch(`${BASE}/trading/presets/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch preset ${id}`);
  return res.json() as Promise<Preset>;
}

export async function createPreset(input: CreatePresetInput): Promise<Preset> {
  const res = await fetch(`${BASE}/trading/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json() as { message?: string };
    throw new Error(err.message ?? 'Failed to create preset');
  }
  return res.json() as Promise<Preset>;
}

export async function updatePreset(id: string, input: UpdatePresetInput): Promise<Preset> {
  const res = await fetch(`${BASE}/trading/presets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json() as { message?: string };
    throw new Error(err.message ?? 'Failed to update preset');
  }
  return res.json() as Promise<Preset>;
}

export async function deletePreset(id: string): Promise<void> {
  const res = await fetch(`${BASE}/trading/presets/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete preset ${id}`);
}

export async function activatePreset(id: string): Promise<Preset> {
  const res = await fetch(`${BASE}/trading/presets/${id}/activate`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to activate preset ${id}`);
  return res.json() as Promise<Preset>;
}

export async function pausePreset(id: string): Promise<Preset> {
  const res = await fetch(`${BASE}/trading/presets/${id}/pause`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to pause preset ${id}`);
  return res.json() as Promise<Preset>;
}

export async function fetchPresetMetrics(id: string): Promise<PresetMetrics> {
  const res = await fetch(`${BASE}/trading/presets/${id}/metrics`);
  if (!res.ok) throw new Error(`Failed to fetch metrics for preset ${id}`);
  return res.json() as Promise<PresetMetrics>;
}

export async function fetchPresetsCompare(): Promise<PresetMetrics[]> {
  const res = await fetch(`${BASE}/trading/presets/compare`);
  if (!res.ok) throw new Error('Failed to fetch presets comparison');
  return res.json() as Promise<PresetMetrics[]>;
}

export async function fetchCandleSummary(): Promise<CandleDatasetSummary[]> {
  const res = await fetch(`${BASE}/research/candles/summary`);
  if (!res.ok) throw new Error('Failed to fetch candle summary');
  return res.json() as Promise<CandleDatasetSummary[]>;
}

export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  from?: string,
  to?: string,
  limit?: number,
): Promise<CandleData[]> {
  const params = new URLSearchParams({ symbol, timeframe });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (limit) params.set('limit', String(limit));
  const res = await fetch(`${BASE}/research/candles?${params}`);
  if (!res.ok) throw new Error('Failed to fetch candles');
  return res.json() as Promise<CandleData[]>;
}
