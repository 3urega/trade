import { useState, useEffect } from 'react';
import { LoadCandlesForm } from './LoadCandlesForm.tsx';
import { RunBacktestForm } from './RunBacktestForm.tsx';
import { BacktestResults } from './BacktestResults.tsx';
import { fetchBacktests, fetchBacktest } from '../../services/api.ts';
import type { BacktestSession } from '../../types/index.ts';

export function ResearchPage() {
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<BacktestSession | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    void fetchBacktests()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, []);

  async function handleBacktestCompleted(session: BacktestSession) {
    // Fetch with predictions for the chart
    try {
      const full = await fetchBacktest(session.id, true);
      setSelectedSession(full);
      setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
    } catch {
      setSelectedSession(session);
    }
  }

  async function handleSelectSession(session: BacktestSession) {
    try {
      const full = await fetchBacktest(session.id, true);
      setSelectedSession(full);
    } catch {
      setSelectedSession(session);
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel: forms + session list */}
      <aside className="w-80 border-r border-gray-800 p-4 flex flex-col gap-4 overflow-y-auto">
        <LoadCandlesForm />
        <RunBacktestForm onCompleted={(s) => void handleBacktestCompleted(s)} />

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
                <div className="font-medium text-gray-200">{s.symbol} · {s.timeframe}</div>
                <div className="text-gray-500 mt-0.5">
                  {s.status} · {s.metrics.totalPredictions} preds
                  {s.status === 'COMPLETED' && ` · DA ${s.metrics.directionalAccuracy.toFixed(0)}%`}
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right panel: results */}
      <main className="flex-1 p-6 overflow-y-auto">
        {!selectedSession && (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Load data, run a backtest, or select a past session to see results.
          </div>
        )}
        {selectedSession && (
          <BacktestResults session={selectedSession} />
        )}
      </main>
    </div>
  );
}
