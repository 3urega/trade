import { useState, useEffect } from 'react';
import { runBacktest } from '../../services/api.ts';
import type { BacktestSession, Timeframe, ModelType, PredictionMode } from '../../types/index.ts';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const MODELS: { value: ModelType; label: string }[] = [
  { value: 'sgd_regressor', label: 'SGD Regressor' },
  { value: 'passive_aggressive', label: 'Passive Aggressive' },
  { value: 'mlp_regressor', label: 'MLP Regressor (neural network)' },
  { value: 'ensemble', label: 'Ensemble (3 models)' },
  { value: 'sgd_classifier', label: 'SGD Classifier (volatility)' },
];

interface Props {
  onCompleted: (session: BacktestSession) => void;
  prefilledSymbol?: string;
  prefilledTimeframe?: Timeframe;
  prefilledFrom?: string;
  prefilledTo?: string;
}

export function RunBacktestForm({ onCompleted, prefilledSymbol, prefilledTimeframe, prefilledFrom, prefilledTo }: Props) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (prefilledSymbol) setSymbol(prefilledSymbol);
  }, [prefilledSymbol]);

  useEffect(() => {
    if (prefilledTimeframe) setTimeframe(prefilledTimeframe);
  }, [prefilledTimeframe]);

  useEffect(() => {
    if (prefilledFrom) setFrom(prefilledFrom);
  }, [prefilledFrom]);

  useEffect(() => {
    if (prefilledTo) setTo(prefilledTo);
  }, [prefilledTo]);
  const [modelType, setModelType] = useState<ModelType>('sgd_regressor');
  const [warmupPeriod, setWarmupPeriod] = useState(20);
  const [predictionMode, setPredictionMode] = useState<PredictionMode>('RETURN');
  const [volatilityThreshold, setVolatilityThreshold] = useState(0.005);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePredictionModeChange(mode: PredictionMode) {
    setPredictionMode(mode);
    if (mode === 'VOLATILITY' && modelType !== 'sgd_classifier') {
      setModelType('sgd_classifier');
    }
    if (mode === 'RETURN' && modelType === 'sgd_classifier') {
      setModelType('sgd_regressor');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const session = await runBacktest({
        symbol,
        timeframe,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        modelType,
        warmupPeriod,
        predictionMode,
        volatilityThreshold: predictionMode === 'VOLATILITY' ? volatilityThreshold : undefined,
      });
      onCompleted(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Run Backtest
        </h3>
        {prefilledFrom && prefilledTo && (
          <span className="text-xs bg-green-900/30 border border-green-700/40 text-green-400 px-2 py-0.5 rounded">
            {prefilledFrom === from && prefilledTo === to ? 'Range from chart' : 'From dataset'}
          </span>
        )}
      </div>
      {!from && !to && (
        <p className="text-xs text-yellow-600/80 mb-3">
          Select a dataset above to prefill the date range.
        </p>
      )}
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
            >
              {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Prediction mode</label>
            <div className="flex gap-2">
              {(['RETURN', 'VOLATILITY'] as PredictionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handlePredictionModeChange(mode)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                    predictionMode === mode
                      ? mode === 'RETURN'
                        ? 'bg-violet-700/60 border-violet-500 text-violet-200'
                        : 'bg-amber-700/50 border-amber-500 text-amber-200'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {mode === 'RETURN' ? 'Return (regression)' : 'Volatility (classifier)'}
                </button>
              ))}
            </div>
            {predictionMode === 'VOLATILITY' && (
              <p className="text-[10px] text-amber-500/80 mt-1">
                Predice si habrá movimiento grande. Auto-selecciona SGD Classifier.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Model</label>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value as ModelType)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
            >
              {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Warmup period</label>
            <input
              type="number"
              min={5}
              max={200}
              value={warmupPeriod}
              onChange={(e) => setWarmupPeriod(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
          {predictionMode === 'VOLATILITY' && (
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Volatility threshold</label>
              <input
                type="number"
                min={0.001}
                max={0.1}
                step={0.001}
                value={volatilityThreshold}
                onChange={(e) => setVolatilityThreshold(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[10px] text-gray-600">movimiento mínimo para clase 1, ej. 0.005 = 0.5%</span>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={running}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
        >
          {running ? 'Running backtest…' : 'Run Backtest'}
        </button>
      </form>

      {running && (
        <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded text-xs text-yellow-400">
          Backtest in progress — this may take a few seconds depending on the dataset size…
        </div>
      )}
      {error && (
        <div className="mt-3 p-3 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
