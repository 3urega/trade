import { useState } from 'react';
import type { PermutationTestResult } from '../../types/index.ts';
import { runPermutationTest } from '../../services/api.ts';

interface Props {
  sessionId: string;
  onCompleted?: () => void;
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

function pLight(p: number): TrafficLight {
  if (p < 0.05) return 'green';
  if (p < 0.15) return 'yellow';
  return 'red';
}

/** Histogram bars from an array of values, highlighting the real value */
function Histogram({ values, realValue }: { values: number[]; realValue: number }) {
  if (values.length === 0) return null;

  const min = Math.min(...values, realValue);
  const max = Math.max(...values, realValue);
  const range = max - min || 0.0001;
  const BINS = 30;

  const bins = Array.from({ length: BINS }, (_, i) => {
    const lo = min + (i / BINS) * range;
    const hi = min + ((i + 1) / BINS) * range;
    return { lo, hi, count: 0 };
  });

  for (const v of values) {
    const idx = Math.min(Math.floor(((v - min) / range) * BINS), BINS - 1);
    bins[idx].count++;
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const realBinIdx = Math.min(Math.floor(((realValue - min) / range) * BINS), BINS - 1);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">
        Distribución de correlaciones bajo H₀ (permutaciones) — línea vertical = valor real
      </p>
      <div className="relative flex items-end gap-px h-24 border-b border-gray-700">
        {bins.map((b, i) => {
          const h = (b.count / maxCount) * 100;
          const isReal = i === realBinIdx;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end"
              title={`[${b.lo.toFixed(4)}, ${b.hi.toFixed(4)}] n=${b.count}${isReal ? ' ← valor real' : ''}`}
            >
              <div
                className={`w-full rounded-t ${isReal ? 'bg-red-400' : 'bg-violet-500/60'}`}
                style={{ height: `${Math.max(h, b.count > 0 ? 4 : 0)}%` }}
              />
            </div>
          );
        })}
        {/* Real value marker line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400"
          style={{ left: `${(((realValue - min) / range) * 100).toFixed(1)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>{min.toFixed(4)}</span>
        <span className="text-red-400">{realValue.toFixed(4)} (real)</span>
        <span>{max.toFixed(4)}</span>
      </div>
    </div>
  );
}

export function PermutationTestPanel({ sessionId, onCompleted }: Props) {
  const [result, setResult] = useState<PermutationTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runPermutationTest(sessionId, 500);
      setResult(res);
      onCompleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          PASO 2 — Validar contra el Azar
        </h3>
        {!result && (
          <button
            onClick={handleRun}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Calculando…
              </>
            ) : (
              'Validar contra azar'
            )}
          </button>
        )}
        {result && (
          <button
            onClick={handleRun}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Recalcular
          </button>
        )}
      </div>

      {!result && !loading && !error && (
        <p className="text-xs text-gray-500">
          Ejecuta 500 permutaciones barajando los retornos reales para verificar si la correlación del modelo
          es estadísticamente distinguible del azar.
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-500/30 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Correlación real</p>
              <span className="text-sm font-bold text-white tabular-nums">
                {result.realCorrelation.toFixed(4)}
              </span>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">p-value empírico</p>
              <div className="flex items-center gap-2">
                {trafficDot(pLight(result.pValueCorrelation))}
                <span className="text-sm font-bold text-white tabular-nums">
                  {result.pValueCorrelation.toFixed(4)}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                {result.pValueCorrelation < 0.05
                  ? 'Distinguible del azar (p<0.05)'
                  : result.pValueCorrelation < 0.15
                    ? 'Marginal (p<0.15)'
                    : 'Podría ser azar (p≥0.15)'}
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Permutaciones</p>
              <span className="text-sm font-bold text-white tabular-nums">{result.permutations}</span>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Predicciones</p>
              <span className="text-sm font-bold text-white tabular-nums">{result.n}</span>
            </div>
          </div>

          <Histogram values={result.permCorrelations} realValue={result.realCorrelation} />

          <div
            className={`rounded-lg border p-3 ${
              result.pValueCorrelation < 0.05
                ? 'border-green-500/30 bg-green-900/10'
                : result.pValueCorrelation < 0.15
                  ? 'border-yellow-500/30 bg-yellow-900/10'
                  : 'border-red-500/30 bg-red-900/10'
            }`}
          >
            <div className="flex items-start gap-2">
              {trafficDot(pLight(result.pValueCorrelation))}
              <p className="text-sm text-gray-200">
                {result.pValueCorrelation < 0.05
                  ? `✅ La correlación (${result.realCorrelation.toFixed(4)}) es estadísticamente significativa. Solo el ${(result.pValueCorrelation * 100).toFixed(1)}% de las permutaciones aleatorias la superan.`
                  : result.pValueCorrelation < 0.15
                    ? `⚠️ Resultado marginal. El ${(result.pValueCorrelation * 100).toFixed(1)}% de permutaciones aleatorias obtienen correlación similar o mayor.`
                    : `❌ La señal no es distinguible del azar. El ${(result.pValueCorrelation * 100).toFixed(1)}% de permutaciones aleatorias obtienen correlación similar o mayor.`}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
