import { useState } from 'react';
import type { BacktestSession, ModelStabilityResult, ModelStabilityFeature } from '../../types/index.ts';
import { fetchModelStability } from '../../services/api.ts';

interface Props {
  currentSession: BacktestSession;
  /** All completed sessions available to compare against */
  availableSessions: BacktestSession[];
}

type TrafficLight = 'green' | 'yellow' | 'red' | 'gray';

function stabilityLight(stdDev: number, mean: number): TrafficLight {
  if (mean === 0) return 'gray';
  const cv = Math.abs(stdDev / mean); // coefficient of variation
  if (cv < 0.3) return 'green';
  if (cv < 0.7) return 'yellow';
  return 'red';
}

function trafficDot(color: TrafficLight) {
  const map: Record<TrafficLight, string> = {
    green: 'inline-block w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0',
    yellow: 'inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 flex-shrink-0',
    red: 'inline-block w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0',
    gray: 'inline-block w-2.5 h-2.5 rounded-full bg-gray-500 flex-shrink-0',
  };
  return <span className={map[color]} />;
}

function fmt(v: number): string {
  if (Math.abs(v) >= 0.01) return v.toFixed(4);
  return v.toExponential(2);
}

function StabilityRow({ feature }: { feature: ModelStabilityFeature; sessionCount?: number }) {
  const light = stabilityLight(feature.stdDev, feature.mean);
  const cv = feature.mean !== 0 ? Math.abs(feature.stdDev / feature.mean) : null;

  return (
    <tr className="border-b border-gray-700/50 hover:bg-gray-700/20">
      <td className="py-2 px-3 text-xs text-gray-300 font-medium">{feature.name}</td>
      <td className="py-2 px-3 text-xs text-right tabular-nums text-white">{fmt(feature.mean)}</td>
      <td className="py-2 px-3 text-xs text-right tabular-nums text-gray-400">{fmt(feature.stdDev)}</td>
      <td className="py-2 px-3 text-xs text-right tabular-nums text-gray-500">
        {cv !== null ? `${(cv * 100).toFixed(0)}%` : '—'}
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center justify-center">
          {trafficDot(light)}
        </div>
      </td>
      <td className="py-2 px-3">
        <div className="flex gap-1 justify-end">
          {feature.values.map((v, i) => (
            <span
              key={i}
              className={`text-xs tabular-nums ${v >= 0 ? 'text-cyan-400' : 'text-red-400'}`}
              title={`Sesión ${i + 1}`}
            >
              {fmt(v)}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

function OverallVerdict({ result }: { result: ModelStabilityResult }) {
  const stableCount = result.features.filter((f) => stabilityLight(f.stdDev, f.mean) === 'green').length;
  const total = result.features.length;
  const pct = total > 0 ? stableCount / total : 0;

  const overall: TrafficLight = pct > 0.7 ? 'green' : pct > 0.4 ? 'yellow' : 'red';
  const colors: Record<TrafficLight, string> = {
    green: 'border-green-500/30 bg-green-900/10',
    yellow: 'border-yellow-500/30 bg-yellow-900/10',
    red: 'border-red-500/30 bg-red-900/10',
    gray: 'border-gray-600 bg-gray-800/20',
  };

  return (
    <div className={`rounded-lg border p-3 ${colors[overall]}`}>
      <div className="flex items-center gap-2">
        {trafficDot(overall)}
        <p className="text-sm text-gray-200">
          {pct > 0.7
            ? `✅ Modelo estable — ${stableCount}/${total} features con coeficientes consistentes entre sesiones`
            : pct > 0.4
              ? `⚠️ Estabilidad moderada — ${stableCount}/${total} features estables. Algunos pesos varían entre periodos.`
              : `❌ Modelo inestable — solo ${stableCount}/${total} features son estables. Los pesos cambian radicalmente entre entrenamientos.`}
        </p>
      </div>
      <p className="text-xs text-gray-500 mt-1 ml-5">
        Coeficiente de variación (CV) &lt;30% = estable (verde) · 30-70% = variable (amarillo) · &gt;70% = inestable (rojo)
      </p>
    </div>
  );
}

export function ModelStabilityPanel({ currentSession, availableSessions }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [result, setResult] = useState<ModelStabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only suggest sessions with same model type and symbol (most useful for comparison)
  const candidates = availableSessions.filter(
    (s) =>
      s.id !== currentSession.id &&
      s.status === 'COMPLETED' &&
      s.sessionType === 'BACKTEST' &&
      s.modelType === currentSession.modelType &&
      s.featureImportance != null,
  );

  const toggleSession = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setResult(null);
  };

  const handleCompare = async () => {
    const ids = [currentSession.id, ...selectedIds];
    setLoading(true);
    setError(null);
    try {
      const res = await fetchModelStability(ids);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
        PASO 3b — Estabilidad del Modelo
      </h3>

      {candidates.length === 0 && (
        <p className="text-xs text-gray-500">
          No hay otras sesiones completadas con el mismo modelo ({currentSession.modelType}) y feature importance calculado.
          Ejecuta más backtests en distintos periodos para comparar la estabilidad de los coeficientes.
        </p>
      )}

      {candidates.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Selecciona sesiones para comparar (mismo modelo, distintos periodos):
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {candidates.map((s) => (
              <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(s.id)}
                  onChange={() => toggleSession(s.id)}
                  className="w-3 h-3 accent-cyan-500"
                />
                <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">
                  {s.symbol} · {s.timeframe} · {s.startDate?.slice(0, 10)} → {s.endDate?.slice(0, 10)}
                </span>
              </label>
            ))}
          </div>
          <button
            onClick={handleCompare}
            disabled={selectedIds.length === 0 || loading}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Comparando…
              </>
            ) : (
              `Comparar estabilidad (${selectedIds.length + 1} sesiones)`
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-500/30 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {result && (
        <>
          <OverallVerdict result={result} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-gray-500">
                  <th className="py-2 px-3 text-left">Feature</th>
                  <th className="py-2 px-3 text-right">Media</th>
                  <th className="py-2 px-3 text-right">Std Dev</th>
                  <th className="py-2 px-3 text-right">CV</th>
                  <th className="py-2 px-3 text-center">Estado</th>
                  <th className="py-2 px-3 text-right">Valores por sesión</th>
                </tr>
              </thead>
              <tbody>
                {result.features
                  .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))
                  .map((f) => (
                    <StabilityRow key={f.name} feature={f} sessionCount={result.sessionCount} />
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
