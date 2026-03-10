import { useState } from 'react';
import type { RollingBacktestResult, RollingWindowResult, Timeframe, ModelType, PredictionMode } from '../../types/index.ts';
import { runRollingBacktest } from '../../services/api.ts';

interface Props {
  symbol: string;
  timeframe: Timeframe;
  modelType: ModelType;
  predictionMode?: PredictionMode;
  signalThreshold?: number;
  onCompleted?: (result: RollingBacktestResult) => void;
}

type TrafficLight = 'green' | 'yellow' | 'red' | 'gray';

function trafficDot(color: TrafficLight) {
  const map: Record<TrafficLight, string> = {
    green: 'inline-block w-3 h-3 rounded-full bg-green-400 flex-shrink-0',
    yellow: 'inline-block w-3 h-3 rounded-full bg-yellow-400 flex-shrink-0',
    red: 'inline-block w-3 h-3 rounded-full bg-red-400 flex-shrink-0',
    gray: 'inline-block w-3 h-3 rounded-full bg-gray-500 flex-shrink-0',
  };
  return <span className={map[color]} />;
}

function stabilityLight(score: number): TrafficLight {
  if (score > 1) return 'green';
  if (score >= 0.5) return 'yellow';
  return 'red';
}

function fmt(v: number | null, decimals = 3): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(decimals);
}

const PRESETS = [
  { label: '6m / 3m paso', windowDays: 180, stepDays: 90 },
  { label: '3m / 1m paso', windowDays: 90, stepDays: 30 },
  { label: '1a / 6m paso', windowDays: 365, stepDays: 180 },
];

/** Simple SVG bar chart for Sharpe by window */
function SharpeBarChart({ windows }: { windows: RollingWindowResult[] }) {
  if (windows.length === 0) return null;

  const sharpes = windows.map((w) => w.sharpeRatio);
  const maxAbs = Math.max(...sharpes.map(Math.abs), 0.1);
  const W = 480;
  const H = 100;
  const PAD = { top: 10, right: 10, bottom: 30, left: 45 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW = Math.floor(chartW / windows.length) - 2;
  const midY = PAD.top + chartH / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 mt-2" style={{ maxWidth: W }}>
      {/* Zero line */}
      <line x1={PAD.left} y1={midY} x2={W - PAD.right} y2={midY} stroke="#4b5563" strokeDasharray="4 2" strokeWidth={1} />
      <text x={PAD.left - 4} y={midY + 3} textAnchor="end" fontSize={9} fill="#9ca3af">0</text>
      <text x={PAD.left - 4} y={PAD.top + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{fmt(maxAbs, 2)}</text>
      <text x={PAD.left - 4} y={PAD.top + chartH} textAnchor="end" fontSize={9} fill="#9ca3af">{fmt(-maxAbs, 2)}</text>

      {/* Y-axis */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="#6b7280" strokeWidth={1} />

      {windows.map((w, i) => {
        const s = w.sharpeRatio;
        const barH = Math.abs(s / maxAbs) * (chartH / 2);
        const x = PAD.left + (i / windows.length) * chartW;
        const y = s >= 0 ? midY - barH : midY;
        return (
          <g key={i}>
            <rect
              x={x + 1} y={y} width={barW} height={barH}
              fill={s >= 0 ? '#22c55e' : '#ef4444'}
              opacity={0.8}
            />
            <text x={x + barW / 2} y={H - 5} textAnchor="middle" fontSize={8} fill="#6b7280">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TemporalConsistencyPanel({
  symbol, timeframe, modelType, predictionMode, signalThreshold, onCompleted,
}: Props) {
  const [from, setFrom] = useState('2022-01-01');
  const [to, setTo] = useState('2025-01-01');
  const [windowDays, setWindowDays] = useState(180);
  const [stepDays, setStepDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RollingBacktestResult | null>(null);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setWindowDays(p.windowDays);
    setStepDays(p.stepDays);
  };

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await runRollingBacktest({
        symbol, timeframe, modelType, predictionMode, signalThreshold,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        windowDays, stepDays,
      });
      setResult(r);
      onCompleted?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const light = result ? stabilityLight(result.aggregate.stabilityScore) : 'gray';
  const agg = result?.aggregate;

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white flex items-center gap-2">
          {result && trafficDot(light)}
          Paso 5 — Consistencia temporal
        </h3>
        {result && (
          <span className="text-xs text-gray-400">
            Stability score: <span className={`font-bold ${light === 'green' ? 'text-green-400' : light === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
              {agg?.stabilityScore.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      <p className="text-sm text-gray-400">
        Ejecuta el mismo backtest en múltiples ventanas temporales para comprobar si el modelo funciona
        consistentemente en distintos periodos de mercado (trending, ranging, etc.).
      </p>

      {/* Presets */}
      <div className="flex gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Config form */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Desde
          <input
            type="date" value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Hasta
          <input
            type="date" value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Ventana (días)
          <input
            type="number" min="30" max="720" step="30"
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Paso (días)
          <input
            type="number" min="7" max="365" step="7"
            value={stepDays}
            onChange={(e) => setStepDays(Number(e.target.value))}
            className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
          />
        </label>
      </div>

      <button
        onClick={handleRun}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
      >
        {loading ? 'Ejecutando backtests…' : 'Probar consistencia temporal'}
      </button>

      {loading && (
        <p className="text-xs text-gray-400">
          Esto puede tardar varios minutos dependiendo del rango y número de ventanas. Por favor espera…
        </p>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {result && (
        <div className="space-y-4 mt-2">
          {/* Stability verdict */}
          <div className={`rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 ${
            light === 'green' ? 'bg-green-900/50 text-green-300' :
            light === 'yellow' ? 'bg-yellow-900/50 text-yellow-300' :
            'bg-red-900/50 text-red-300'
          }`}>
            {trafficDot(light)}
            {light === 'green' && `Consistente: Sharpe medio ${agg?.sharpeMean.toFixed(2)}, estabilidad ${agg?.stabilityScore.toFixed(2)} > 1. El modelo funciona en distintos periodos.`}
            {light === 'yellow' && `Moderado: Sharpe medio ${agg?.sharpeMean.toFixed(2)}, estabilidad ${agg?.stabilityScore.toFixed(2)}. Funciona en algunos periodos pero es inconsistente.`}
            {light === 'red' && `Inconsistente: Sharpe medio ${agg?.sharpeMean.toFixed(2)}, estabilidad ${agg?.stabilityScore.toFixed(2)} < 0.5. El modelo no es estable a lo largo del tiempo.`}
          </div>

          {/* Aggregate metrics */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { label: 'Sharpe medio', value: fmt(agg?.sharpeMean ?? null) },
              { label: 'Sharpe StdDev', value: fmt(agg?.sharpeStdDev ?? null) },
              { label: 'Stability score', value: fmt(agg?.stabilityScore ?? null, 2) },
              { label: 'Skill score medio', value: `${((agg?.skillScoreMean ?? 0) * 100).toFixed(1)}%` },
              { label: 'Corr. media', value: fmt(agg?.correlationMean ?? null) },
              { label: '% Sharpe > 0', value: `${(agg?.pctPositiveSharpe ?? 0).toFixed(0)}%` },
            ].map((m) => (
              <div key={m.label} className="bg-gray-700/50 rounded p-2 text-center">
                <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                <p className="text-sm font-mono text-white">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Sharpe por ventana temporal (barras = ventanas en orden cronológico)</p>
            <SharpeBarChart windows={result.windows} />
          </div>

          {/* Windows table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-300">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-1 pr-3">#</th>
                  <th className="text-left py-1 pr-3">Desde</th>
                  <th className="text-left py-1 pr-3">Hasta</th>
                  <th className="text-right pr-3">Sharpe</th>
                  <th className="text-right pr-3">Skill</th>
                  <th className="text-right pr-3">Dir.Acc</th>
                  <th className="text-right pr-3">Corr.</th>
                  <th className="text-right">Ret. BUY</th>
                </tr>
              </thead>
              <tbody>
                {result.windows.map((w, i) => (
                  <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-1 pr-3 text-gray-500">{i + 1}</td>
                    <td className="py-1 pr-3 text-gray-300">{w.from.slice(0, 10)}</td>
                    <td className="py-1 pr-3 text-gray-300">{w.to.slice(0, 10)}</td>
                    <td className={`text-right pr-3 font-mono ${w.sharpeRatio > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {w.sharpeRatio.toFixed(3)}
                    </td>
                    <td className="text-right pr-3 font-mono">{(w.skillScore * 100).toFixed(1)}%</td>
                    <td className="text-right pr-3 font-mono">{(w.directionalAccuracy * 100).toFixed(1)}%</td>
                    <td className="text-right pr-3 font-mono">{fmt(w.predictionCorrelation)}</td>
                    <td className={`text-right font-mono ${w.conditionalReturnBuy !== null && w.conditionalReturnBuy > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmt(w.conditionalReturnBuy, 5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500">
            Nota: cada ventana genera una sesión de backtest independiente visible en "Past Sessions".
          </p>
        </div>
      )}
    </div>
  );
}
