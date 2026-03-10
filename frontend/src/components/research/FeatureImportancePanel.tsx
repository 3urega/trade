import { useState } from 'react';
import type { FeatureImportanceResult, FeatureImportanceItem } from '../../types/index.ts';
import { fetchFeatureImportance } from '../../services/api.ts';

interface Props {
  sessionId: string;
  /** If already available from backtest response, use it directly without fetching */
  preloaded?: FeatureImportanceResult;
}

function formatImportance(v: number): string {
  if (Math.abs(v) >= 0.01) return v.toFixed(4);
  return v.toExponential(2);
}

function FeatureBar({ item, maxAbs, rank }: { item: FeatureImportanceItem; maxAbs: number; rank: number }) {
  const pct = maxAbs > 0 ? (Math.abs(item.importance) / maxAbs) * 100 : 0;
  const isPositive = item.importance >= 0;
  const isTop3 = rank <= 3;
  const isNearZero = Math.abs(item.importance) < maxAbs * 0.05;

  return (
    <div className={`flex items-center gap-2 py-1 ${isNearZero ? 'opacity-40' : ''}`}>
      <div className="w-4 text-right text-xs text-gray-600 flex-shrink-0">{rank}</div>
      <div className={`w-36 text-xs flex-shrink-0 truncate ${isTop3 ? 'text-cyan-300 font-medium' : 'text-gray-400'}`}>
        {item.name}
      </div>
      <div className="flex-1 flex items-center gap-1">
        {/* Negative side (left-aligned from center on the left) */}
        <div className="flex-1 flex justify-end">
          {!isPositive && (
            <div
              className="h-4 rounded-l bg-red-400/70"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        {/* Center divider */}
        <div className="w-px h-4 bg-gray-600 flex-shrink-0" />
        {/* Positive side */}
        <div className="flex-1 flex justify-start">
          {isPositive && (
            <div
              className="h-4 rounded-r bg-cyan-400/70"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </div>
      <div className={`w-20 text-xs text-right tabular-nums flex-shrink-0 ${isPositive ? 'text-cyan-400' : 'text-red-400'}`}>
        {isPositive ? '+' : ''}{formatImportance(item.importance)}
      </div>
    </div>
  );
}

function ImportanceChart({ result }: { result: FeatureImportanceResult }) {
  const sorted = [...result.items].sort((a, b) => a.rank - b.rank);
  const maxAbs = Math.max(...result.importance.map(Math.abs));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">
          Importancia por feature — {result.modelType}
        </p>
        <div className="flex gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 bg-cyan-400/70 rounded-r" /> Positiva
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 bg-red-400/70 rounded-l" /> Negativa
          </span>
        </div>
      </div>
      <div className="space-y-0.5">
        {sorted.map((item) => (
          <FeatureBar key={item.name} item={item} maxAbs={maxAbs} rank={item.rank} />
        ))}
      </div>
      <p className="text-xs text-gray-600 mt-2">
        Top 3 en <span className="text-cyan-300">cian</span>. Features con importancia &lt;5% del máximo en gris (ruido).
        Valores negativos = el modelo apuesta en contra de esa feature.
      </p>
    </div>
  );
}

function EnsembleBreakdown({ result }: { result: FeatureImportanceResult }) {
  if (!result.perModel || Object.keys(result.perModel).length === 0) return null;
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-gray-500 hover:text-gray-300 underline mt-1"
      >
        {expanded ? 'Ocultar' : 'Ver'} importancia por sub-modelo del ensemble
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {Object.entries(result.perModel).map(([name, values]) => {
            const maxAbs = Math.max(...values.map(Math.abs));
            return (
              <div key={name}>
                <p className="text-xs text-gray-500 mb-1">{name}</p>
                <div className="space-y-0.5">
                  {result.featureNames.map((fname, i) => {
                    const pct = maxAbs > 0 ? (Math.abs(values[i]) / maxAbs) * 100 : 0;
                    const pos = values[i] >= 0;
                    return (
                      <div key={fname} className="flex items-center gap-2">
                        <div className="w-36 text-xs text-gray-500 truncate">{fname}</div>
                        <div className="flex-1 flex items-center gap-1">
                          <div className="flex-1 flex justify-end">
                            {!pos && <div className="h-3 rounded-l bg-red-400/50" style={{ width: `${pct}%` }} />}
                          </div>
                          <div className="w-px h-3 bg-gray-700 flex-shrink-0" />
                          <div className="flex-1">
                            {pos && <div className="h-3 rounded-r bg-cyan-400/50" style={{ width: `${pct}%` }} />}
                          </div>
                        </div>
                        <div className="w-16 text-xs text-right tabular-nums text-gray-500">
                          {pos ? '+' : ''}{formatImportance(values[i])}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FeatureImportancePanel({ sessionId, preloaded }: Props) {
  const [result, setResult] = useState<FeatureImportanceResult | null>(preloaded ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const fi = await fetchFeatureImportance(sessionId);
      setResult(fi);
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
          PASO 3 — Entender la Señal (Feature Importance)
        </h3>
        {!result && (
          <button
            onClick={handleLoad}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Cargando…
              </>
            ) : (
              'Analizar features'
            )}
          </button>
        )}
        {result && (
          <button
            onClick={handleLoad}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Recargar
          </button>
        )}
      </div>

      {!result && !loading && !error && (
        <p className="text-xs text-gray-500">
          Carga el snapshot del modelo para ver qué features impulsan las predicciones.
          Las features con importancia alta y consistente son las que contienen la señal real.
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-500/30 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {result && (
        <>
          <ImportanceChart result={result} />
          {result.perModel && <EnsembleBreakdown result={result} />}
        </>
      )}
    </div>
  );
}
