import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineSeries } from 'lightweight-charts';
import type { BacktestSession } from '../../types/index.ts';
import {
  chartLocalization,
  chartLayoutOptions,
  chartGridOptions,
  chartRightPriceScaleOptions,
  getChartTimeScaleOptions,
} from '../../utils/chartConfig.ts';

interface Props {
  session: BacktestSession;
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'positive' | 'negative' | 'neutral';
}) {
  const valueColor =
    highlight === 'positive'
      ? 'text-green-400'
      : highlight === 'negative'
        ? 'text-red-400'
        : 'text-white';
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-base font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}

function skillHighlight(score: number): 'positive' | 'negative' | 'neutral' {
  if (score > 0.05) return 'positive';
  if (score < -0.05) return 'negative';
  return 'neutral';
}

const METRICS_GLOSSARY: { term: string; desc: string }[] = [
  {
    term: 'MAE (Mean Absolute Error)',
    desc: 'Error medio absoluto en precios. Promedio de |predicho - real|. Indica cuánto se desvía el modelo en unidades de precio.',
  },
  {
    term: 'RMSE (Root Mean Squared Error)',
    desc: 'Raíz del error cuadrático medio. Penaliza más los errores grandes. En las mismas unidades que el precio.',
  },
  {
    term: 'MAPE (Mean Absolute Percentage Error)',
    desc: 'Error medio en porcentaje. |predicho - real| / real. Útil para comparar activos con precios muy distintos.',
  },
  {
    term: 'Predictions',
    desc: 'Número de predicciones evaluadas en esta sesión.',
  },
  {
    term: 'MAE Return',
    desc: 'Error medio absoluto en log-returns (no en precio). El modelo predice retornos; esta métrica mide qué tan bien los captura.',
  },
  {
    term: 'RMSE Return',
    desc: 'Raíz del error cuadrático medio en log-returns. Más sensible a errores grandes en retorno.',
  },
  {
    term: 'Dir. Accuracy (Directional Accuracy)',
    desc: 'Porcentaje de veces que el modelo acertó la dirección (subida vs bajada). Útil para trading direccional.',
  },
  {
    term: 'Naive MAE',
    desc: 'MAE de la estrategia naive: "el próximo precio será igual al actual". Baseline mínimo para comparar.',
  },
  {
    term: 'Skill Score',
    desc: '1 - (MAE_modelo / MAE_naive). > 0 = mejor que naive, = 0 = igual, < 0 = peor. Métrica clave para validar si el modelo aporta valor.',
  },
  {
    term: 'Sharpe (sim.)',
    desc: 'Sharpe ratio simulado: long cuando predice subida, short cuando predice bajada. mean(pnl) / std(pnl). Mide rentabilidad ajustada por riesgo.',
  },
];

function MetricsGlossary() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-xs text-gray-400 hover:bg-gray-800/50 transition-colors"
      >
        <span className="font-medium">Explicación de métricas</span>
        <span className="text-gray-600">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-700 px-3 py-3 space-y-2 bg-gray-900/50">
          {METRICS_GLOSSARY.map(({ term, desc }) => (
            <div key={term}>
              <p className="text-xs font-medium text-gray-300">{term}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BacktestResults({ session }: Props) {
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const statusColor: Record<string, string> = {
    COMPLETED: 'text-green-400',
    RUNNING: 'text-yellow-400',
    FAILED: 'text-red-400',
    CREATED: 'text-gray-400',
  };

  const isForwardTest = session.sessionType === 'FORWARD_TEST';

  useEffect(() => {
    if (!containerRef.current || !session.predictions?.length) return;

    chartRef.current = createChart(containerRef.current, {
      layout: chartLayoutOptions,
      localization: chartLocalization,
      grid: chartGridOptions,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: chartRightPriceScaleOptions,
      timeScale: getChartTimeScaleOptions(session.timeframe),
      width: containerRef.current.clientWidth,
      height: 220,
    });

    const actualSeries = chartRef.current.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 2 });
    const predictedSeries = chartRef.current.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1 });

    const toTime = (ts: string) => Math.floor(new Date(ts).getTime() / 1000) as unknown as import('lightweight-charts').Time;

    const actualData = session.predictions.map((p) => ({ time: toTime(p.timestamp), value: p.actual }));
    const predictedData = session.predictions.map((p) => ({ time: toTime(p.timestamp), value: p.predicted }));

    actualSeries.setData(actualData);
    predictedSeries.setData(predictedData);
    chartRef.current.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chartRef.current?.remove();
    };
  }, [session.id, session.predictions?.length]);

  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-200">{session.symbol}</span>
          <span className="text-xs text-gray-500">{session.timeframe} · {session.modelType}</span>
          {isForwardTest ? (
            <span className="text-xs bg-violet-900/40 border border-violet-700/50 text-violet-400 px-2 py-0.5 rounded">
              Forward Test
            </span>
          ) : (
            <span className="text-xs bg-cyan-900/30 border border-cyan-700/40 text-cyan-500 px-2 py-0.5 rounded">
              Backtest
            </span>
          )}
        </div>
        <span className={`text-xs font-semibold ${statusColor[session.status] ?? 'text-gray-400'}`}>
          {session.status}
        </span>
      </div>
      {isForwardTest && session.sourceSessionId && (
        <p className="text-xs text-gray-600">
          Model from backtest: <span className="font-mono">{session.sourceSessionId.slice(0, 8)}…</span>
        </p>
      )}

      {session.status === 'FAILED' && session.errorMessage && (
        <div className="p-3 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {session.errorMessage}
        </div>
      )}

      {session.status === 'COMPLETED' && (
        <>
          {/* Row 1: Core price metrics */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Price error</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="MAE" value={session.metrics.mae.toFixed(4)} />
              <MetricCard label="RMSE" value={session.metrics.rmse.toFixed(4)} />
              <MetricCard label="MAPE" value={`${session.metrics.mape.toFixed(2)}%`} />
              <MetricCard label="Predictions" value={String(session.metrics.totalPredictions)} />
            </div>
          </div>

          {/* Row 2: Return-space metrics */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Return error</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetricCard label="MAE Return" value={session.metrics.maeReturn.toFixed(6)} />
              <MetricCard label="RMSE Return" value={session.metrics.rmseReturn.toFixed(6)} />
              <MetricCard label="Dir. Accuracy" value={`${session.metrics.directionalAccuracy.toFixed(1)}%`} />
            </div>
          </div>

          {/* Row 3: Baseline comparison and finance */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">vs Baseline</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetricCard label="Naive MAE" value={session.metrics.maeNaive.toFixed(4)} />
              <MetricCard
                label="Skill Score"
                value={session.metrics.skillScore.toFixed(4)}
                highlight={skillHighlight(session.metrics.skillScore)}
              />
              <MetricCard
                label="Sharpe (sim.)"
                value={session.metrics.sharpeRatio.toFixed(3)}
                highlight={skillHighlight(session.metrics.sharpeRatio)}
              />
            </div>
          </div>

          {session.predictions && session.predictions.length > 0 && (
            <div>
              <div className="flex items-center gap-4 mb-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5 bg-cyan-400" /> Actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5 bg-violet-400" /> Predicted
                </span>
              </div>
              <div ref={containerRef} className="w-full rounded overflow-hidden" />
            </div>
          )}

          {/* Glosario de métricas */}
          <MetricsGlossary />
        </>
      )}

      <p className="text-xs text-gray-600">
        Session: <span className="font-mono">{session.id.slice(0, 8)}…</span>
        {session.completedAt && ` · Completed ${new Date(session.completedAt).toLocaleString()}`}
      </p>
    </div>
  );
}
