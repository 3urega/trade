import { useState, useEffect, useCallback } from 'react';
import { fetchCandleSummary } from '../../services/api.ts';
import type { CandleDatasetSummary, Timeframe } from '../../types/index.ts';

interface Props {
  onSelect: (symbol: string, timeframe: Timeframe, start: string, end: string) => void;
  selectedKey?: string;
  refreshTrigger?: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCount(n: number) {
  return n.toLocaleString('es-ES');
}

export function DatasetSummary({ onSelect, selectedKey, refreshTrigger }: Props) {
  const [datasets, setDatasets] = useState<CandleDatasetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCandleSummary();
      setDatasets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading datasets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Loaded Datasets
        </h3>
        <p className="text-xs text-gray-500 animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Loaded Datasets
        </h3>
        <button
          onClick={() => void load()}
          className="text-xs text-gray-500 hover:text-cyan-400 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400 mb-3">
          {error}
        </div>
      )}

      {datasets.length === 0 && !error ? (
        <p className="text-xs text-gray-600 italic">
          No datasets yet. Use &ldquo;Load Historical Data&rdquo; to add one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left pb-2 pr-4 font-medium">Symbol</th>
                <th className="text-left pb-2 pr-4 font-medium">TF</th>
                <th className="text-left pb-2 pr-4 font-medium">From</th>
                <th className="text-left pb-2 pr-4 font-medium">To</th>
                <th className="text-right pb-2 font-medium">Candles</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((ds) => {
                const key = `${ds.symbol}-${ds.timeframe}`;
                const isSelected = selectedKey === key;
                return (
                  <tr
                    key={key}
                    onClick={() => onSelect(ds.symbol, ds.timeframe as Timeframe, ds.start, ds.end)}
                    className={`cursor-pointer border-b border-gray-800/50 transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/10 text-cyan-300'
                        : 'text-gray-300 hover:bg-gray-800/60'
                    }`}
                  >
                    <td className="py-2 pr-4 font-mono font-semibold">{ds.symbol}</td>
                    <td className="py-2 pr-4">
                      <span className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">
                        {ds.timeframe}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-400">{formatDate(ds.start)}</td>
                    <td className="py-2 pr-4 text-gray-400">{formatDate(ds.end)}</td>
                    <td className="py-2 text-right font-mono text-gray-300">
                      {formatCount(ds.count)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
