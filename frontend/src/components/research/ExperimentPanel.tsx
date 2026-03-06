import { useState, useEffect, useCallback } from 'react';
import {
  fetchExperiments,
  createExperiment,
  deleteExperiment,
  toggleExperiment,
  runExperimentNow,
} from '../../services/api.ts';
import type { ResearchExperiment, CreateExperimentInput, Timeframe, ModelType } from '../../types/index.ts';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const MODELS: { value: ModelType; label: string }[] = [
  { value: 'sgd_regressor', label: 'SGD Regressor' },
  { value: 'passive_aggressive', label: 'Passive Aggressive' },
  { value: 'mlp_regressor', label: 'MLP (neural network)' },
  { value: 'ensemble', label: 'Ensemble (3 models)' },
];

interface Props {
  onSelectSession?: (sessionId: string) => void;
}

function StatusBadge({ status }: { status: ResearchExperiment['lastRunStatus'] }) {
  if (!status) return <span className="text-[9px] text-gray-600">never run</span>;
  const map = {
    SUCCESS: 'bg-emerald-900/50 text-emerald-400',
    FAILED: 'bg-red-900/50 text-red-400',
    RUNNING: 'bg-yellow-900/50 text-yellow-400 animate-pulse',
  } as const;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'hace <1h';
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

const EMPTY_FORM: CreateExperimentInput = {
  name: '',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  modelType: 'sgd_regressor',
  warmupPeriod: 20,
  trainWindowDays: 90,
  forwardWindowDays: 7,
  initialCapital: 10000,
};

export function ExperimentPanel({ onSelectSession }: Props) {
  const [experiments, setExperiments] = useState<ResearchExperiment[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateExperimentInput>(EMPTY_FORM);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setExperiments(await fetchExperiments());
    } catch {
      // silently fail — not critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await createExperiment(form);
      setExperiments((prev) => [created, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating experiment');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const updated = await toggleExperiment(id);
      setExperiments((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error toggling experiment');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteExperiment(id);
      setExperiments((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting experiment');
    }
  }

  async function handleRun(id: string) {
    setRunning(id);
    setError(null);
    try {
      const updated = await runExperimentNow(id);
      setExperiments((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error running experiment');
      void load();
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Experiments
        </h3>
        <div className="flex items-center gap-2">
          {loading && <span className="text-[9px] text-gray-600 animate-pulse">loading…</span>}
          <button
            onClick={() => void load()}
            className="text-[10px] text-gray-600 hover:text-cyan-400 transition-colors"
            title="Refresh"
          >
            ↻
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-[10px] bg-cyan-700/40 hover:bg-cyan-700/70 text-cyan-300 px-2 py-0.5 rounded transition-colors"
          >
            {showForm ? '✕ Cancel' : '+ New'}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={(e) => void handleCreate(e)} className="p-3 border-b border-gray-800 space-y-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. BTC 1h SGD 90d"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Symbol</label>
              <input
                required
                value={form.symbol}
                onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Timeframe</label>
              <select
                value={form.timeframe}
                onChange={(e) => setForm((f) => ({ ...f, timeframe: e.target.value as Timeframe }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
              >
                {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-gray-500 block mb-0.5">Model</label>
              <select
                value={form.modelType}
                onChange={(e) => setForm((f) => ({ ...f, modelType: e.target.value as ModelType }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
              >
                {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Train days</label>
              <input
                type="number" min={7} max={730}
                value={form.trainWindowDays}
                onChange={(e) => setForm((f) => ({ ...f, trainWindowDays: Number(e.target.value) }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Fwd days</label>
              <input
                type="number" min={1} max={90}
                value={form.forwardWindowDays}
                onChange={(e) => setForm((f) => ({ ...f, forwardWindowDays: Number(e.target.value) }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Warmup</label>
              <input
                type="number" min={5} max={200}
                value={form.warmupPeriod}
                onChange={(e) => setForm((f) => ({ ...f, warmupPeriod: Number(e.target.value) }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Capital (USDT)</label>
              <input
                type="number" min={1}
                value={form.initialCapital}
                onChange={(e) => setForm((f) => ({ ...f, initialCapital: Number(e.target.value) }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded transition-colors"
          >
            {creating ? 'Creating…' : 'Create experiment'}
          </button>
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="mx-3 my-2 p-2 bg-red-900/30 border border-red-700/50 rounded text-[10px] text-red-400">
          {error}
        </div>
      )}

      {/* List */}
      {experiments.length === 0 && !showForm ? (
        <p className="px-4 py-3 text-[10px] text-gray-600 italic">
          No experiments yet. Create one to automate backtest + forward test.
        </p>
      ) : (
        <div className="divide-y divide-gray-800/60">
          {experiments.map((exp) => (
            <div key={exp.id} className="px-3 py-2.5 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-1">
                {/* Name + status */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => handleToggle(exp.id)}
                    className={`w-3 h-3 rounded-full border shrink-0 transition-colors ${
                      exp.enabled
                        ? 'bg-cyan-500 border-cyan-400'
                        : 'bg-transparent border-gray-600'
                    }`}
                    title={exp.enabled ? 'Disable' : 'Enable'}
                  />
                  <span className="text-xs text-gray-200 font-medium truncate">{exp.name}</span>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <StatusBadge status={exp.lastRunStatus} />
                  <button
                    onClick={() => void handleRun(exp.id)}
                    disabled={running === exp.id}
                    className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors disabled:opacity-40 px-1"
                    title="Run now"
                  >
                    {running === exp.id ? '…' : '▶'}
                  </button>
                  <button
                    onClick={() => void handleDelete(exp.id)}
                    className="text-[10px] text-gray-600 hover:text-red-400 transition-colors px-1"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Config summary */}
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-gray-500">
                <span>{exp.symbol} · {exp.timeframe} · {exp.modelType.replace('_regressor', '').replace('passive_aggressive', 'PA')}</span>
                <span>train {exp.trainWindowDays}d · fwd {exp.forwardWindowDays}d</span>
                {exp.lastRunAt && <span className="text-gray-600">{formatRelative(exp.lastRunAt)}</span>}
              </div>

              {/* Last session links */}
              {(exp.lastBacktestSessionId || exp.lastForwardSessionId) && onSelectSession && (
                <div className="flex gap-2 text-[9px] mt-0.5">
                  {exp.lastBacktestSessionId && (
                    <button
                      onClick={() => onSelectSession(exp.lastBacktestSessionId!)}
                      className="text-cyan-600 hover:text-cyan-400 transition-colors"
                    >
                      Backtest ↗
                    </button>
                  )}
                  {exp.lastForwardSessionId && (
                    <button
                      onClick={() => onSelectSession(exp.lastForwardSessionId!)}
                      className="text-violet-500 hover:text-violet-300 transition-colors"
                    >
                      Forward test ↗
                    </button>
                  )}
                </div>
              )}

              {/* Error message */}
              {exp.lastRunStatus === 'FAILED' && exp.lastError && (
                <p className="text-[9px] text-red-400/80 truncate" title={exp.lastError}>
                  {exp.lastError}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
