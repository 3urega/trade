import { useState, useEffect } from 'react';
import { runForwardTest } from '../../services/api.ts';
import type { BacktestSession } from '../../types/index.ts';

interface Props {
  completedSessions: BacktestSession[];
  onCompleted: (session: BacktestSession) => void;
  prefilledFrom?: string;
  prefilledTo?: string;
}

export function ForwardTestForm({ completedSessions, onCompleted, prefilledFrom, prefilledTo }: Props) {
  const [backtestSessionId, setBacktestSessionId] = useState('');
  const [from, setFrom] = useState('2024-04-01');
  const [to, setTo] = useState('2024-06-01');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefilledFrom) setFrom(prefilledFrom);
  }, [prefilledFrom]);

  useEffect(() => {
    if (prefilledTo) setTo(prefilledTo);
  }, [prefilledTo]);

  // Auto-select first session with a snapshot, or first any
  useEffect(() => {
    if (!backtestSessionId && completedSessions.length > 0) {
      const first = completedSessions.find((s) => s.modelSnapshotId) ?? completedSessions[0];
      setBacktestSessionId(first.id);
    }
  }, [completedSessions, backtestSessionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const selected = completedSessions.find((s) => s.id === backtestSessionId);
    if (!backtestSessionId || !selected) {
      setError('Select a completed backtest session first.');
      return;
    }
    if (!selected.modelSnapshotId) {
      setError('This backtest has no saved model. Run a new backtest (after restarting ML engine) to persist the model.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const session = await runForwardTest({
        backtestSessionId,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      });
      onCompleted(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }

  const selectedSession = completedSessions.find((s) => s.id === backtestSessionId);
  const canRun = selectedSession?.modelSnapshotId;

  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-violet-900/40">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Forward Test
        </h3>
        <span className="text-xs bg-violet-900/30 border border-violet-700/40 text-violet-400 px-2 py-0.5 rounded">
          Out-of-sample
        </span>
      </div>

      {completedSessions.length === 0 ? (
        <p className="text-xs text-gray-600 italic">
          No completed backtests yet. Run a backtest first.
        </p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Source Backtest Model</label>
            <select
              value={backtestSessionId}
              onChange={(e) => setBacktestSessionId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-violet-500"
            >
              <option value="">— select —</option>
              {completedSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.symbol} · {s.timeframe} · {s.modelType} ({new Date(s.createdAt).toLocaleDateString('es-ES')})
                  {s.modelSnapshotId ? '' : ' — model not saved'}
                </option>
              ))}
            </select>
            {selectedSession && !selectedSession.modelSnapshotId && (
              <p className="mt-1 text-xs text-amber-500">
                Model was not persisted. Restart the ML engine container and run a new backtest to save it.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {prefilledFrom && prefilledTo && (
            <p className="text-xs text-violet-400/70">Range filled from chart selection</p>
          )}

          <button
            type="submit"
            disabled={running || !backtestSessionId || !canRun}
            className="w-full bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
          >
            {running ? 'Running forward test…' : canRun ? 'Run Forward Test' : 'Select a session with saved model'}
          </button>
        </form>
      )}

      {running && (
        <div className="mt-3 p-3 bg-violet-900/20 border border-violet-700/30 rounded text-xs text-violet-400">
          Predicting out-of-sample data — no re-training…
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
