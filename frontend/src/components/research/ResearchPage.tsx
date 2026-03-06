import { useState, useEffect } from 'react';
import { LoadCandlesForm } from './LoadCandlesForm.tsx';
import { RunBacktestForm } from './RunBacktestForm.tsx';
import { BacktestResults } from './BacktestResults.tsx';
import { DatasetSummary } from './DatasetSummary.tsx';
import { CandlestickChart } from './CandlestickChart.tsx';
import { ForwardTestForm } from './ForwardTestForm.tsx';
import { fetchBacktests, fetchBacktest } from '../../services/api.ts';
import type { BacktestSession, Timeframe } from '../../types/index.ts';

interface SelectedDataset {
  symbol: string;
  timeframe: Timeframe;
  start: string;
  end: string;
}

interface ChartRange {
  from: string;
  to: string;
}

export function ResearchPage() {
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<BacktestSession | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<SelectedDataset | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [datasetRefresh, setDatasetRefresh] = useState(0);
  const [chartRange, setChartRange] = useState<ChartRange | null>(null);

  useEffect(() => {
    void fetchBacktests()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, []);

  function handleCandlesLoaded() {
    setDatasetRefresh((n) => n + 1);
  }

  function handleDatasetSelect(symbol: string, timeframe: Timeframe, start: string, end: string) {
    setSelectedDataset({ symbol, timeframe, start, end });
    setSelectedSession(null);
    setChartRange(null);
  }

  function handleChartRangeSelect(from: string, to: string) {
    setChartRange({ from, to });
  }

  async function handleSessionCompleted(session: BacktestSession) {
    try {
      const full = await fetchBacktest(session.id, true);
      // Preserve tradingMetrics from the POST response if the GET doesn't include them yet
      if (session.tradingMetrics && !full.tradingMetrics) {
        full.tradingMetrics = session.tradingMetrics;
      }
      setSelectedSession(full);
      setSelectedDataset(null);
      setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
    } catch {
      setSelectedSession(session);
      setSelectedDataset(null);
    }
  }

  async function handleSelectSession(session: BacktestSession) {
    try {
      const full = await fetchBacktest(session.id, true);
      setSelectedSession(full);
      setSelectedDataset(null);
    } catch {
      setSelectedSession(session);
      setSelectedDataset(null);
    }
  }

  const selectedDatasetKey = selectedDataset
    ? `${selectedDataset.symbol}-${selectedDataset.timeframe}`
    : undefined;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel */}
      <aside className="w-80 border-r border-gray-800 p-4 flex flex-col gap-4 overflow-y-auto">
        <LoadCandlesForm onSuccess={handleCandlesLoaded} />

        <DatasetSummary
          onSelect={handleDatasetSelect}
          selectedKey={selectedDatasetKey}
          refreshTrigger={datasetRefresh}
        />

        <RunBacktestForm
          onCompleted={(s) => void handleSessionCompleted(s)}
          prefilledFrom={chartRange?.from}
          prefilledTo={chartRange?.to}
        />

        <ForwardTestForm
          completedSessions={sessions.filter((s) => s.status === 'COMPLETED' && (s.sessionType === 'BACKTEST' || !s.sessionType))}
          onCompleted={(s) => void handleSessionCompleted(s)}
          prefilledFrom={chartRange?.from}
          prefilledTo={chartRange?.to}
        />

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Past Sessions
          </h3>
          {loadingSessions && (
            <p className="text-xs text-gray-600">Loading…</p>
          )}
          {!loadingSessions && sessions.length === 0 && (
            <p className="text-xs text-gray-600">No backtest sessions yet.</p>
          )}
          <div className="space-y-1">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => void handleSelectSession(s)}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                  selectedSession?.id === s.id
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                    : 'bg-gray-800/50 hover:bg-gray-800 text-gray-400'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-200">{s.symbol} · {s.timeframe}</span>
                  {s.sessionType === 'FORWARD_TEST' && (
                    <span className="text-[10px] bg-violet-900/40 text-violet-400 px-1 rounded">FWD</span>
                  )}
                </div>
                <div className="text-gray-500 mt-0.5">
                  {s.status} · {s.metrics.totalPredictions} preds
                  {s.status === 'COMPLETED' && ` · DA ${s.metrics.directionalAccuracy.toFixed(0)}%`}
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right panel */}
      <main className="flex-1 p-6 overflow-y-auto space-y-6">
        {!selectedDataset && !selectedSession && (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Load data and select a dataset to see its chart, or run a backtest to see results.
          </div>
        )}

        {selectedDataset && (
          <CandlestickChart
            symbol={selectedDataset.symbol}
            timeframe={selectedDataset.timeframe}
            start={selectedDataset.start}
            end={selectedDataset.end}
            onRangeSelect={handleChartRangeSelect}
          />
        )}

        {selectedSession && (
          <BacktestResults session={selectedSession} />
        )}
      </main>
    </div>
  );
}
