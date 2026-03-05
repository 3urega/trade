import { useState } from 'react';
import { runBacktest } from '../../services/api.ts';
import type { BacktestSession, Timeframe, ModelType } from '../../types/index.ts';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const MODELS: { value: ModelType; label: string }[] = [
  { value: 'sgd_regressor', label: 'SGD Regressor' },
  { value: 'passive_aggressive', label: 'Passive Aggressive' },
];

interface Props {
  onCompleted: (session: BacktestSession) => void;
}

export function RunBacktestForm({ onCompleted }: Props) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [from, setFrom] = useState('2024-01-01');
  const [to, setTo] = useState('2024-03-01');
  const [modelType, setModelType] = useState<ModelType>('sgd_regressor');
  const [warmupPeriod, setWarmupPeriod] = useState(20);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
        Run Backtest
      </h3>
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
