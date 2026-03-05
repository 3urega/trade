import { useState } from 'react';
import { loadCandles } from '../../services/api.ts';
import type { LoadCandlesResult, Timeframe } from '../../types/index.ts';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

interface Props {
  onSuccess?: () => void;
}

export function LoadCandlesForm({ onSuccess }: Props) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [from, setFrom] = useState('2024-01-01');
  const [to, setTo] = useState('2024-03-01');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoadCandlesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await loadCandles({
        symbol,
        timeframe,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      });
      setResult(res);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
        Load Historical Data
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
              placeholder="BTCUSDT"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
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
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
        >
          {loading ? 'Loading…' : 'Load Candles'}
        </button>
      </form>

      {result && (
        <div className="mt-3 p-3 bg-green-900/30 border border-green-700/50 rounded text-xs text-green-400">
          Loaded <span className="font-bold">{result.loaded}</span> candles for {result.symbol} ({result.timeframe})
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
