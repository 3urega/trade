import { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries } from 'lightweight-charts';
import type { BacktestSession } from '../../types/index.ts';

interface Props {
  session: BacktestSession;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-base font-bold text-white tabular-nums">{value}</p>
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

  useEffect(() => {
    if (!containerRef.current || !session.predictions?.length) return;

    chartRef.current = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#030712' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true },
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
        <div>
          <span className="text-sm font-bold text-gray-200">{session.symbol}</span>
          <span className="ml-2 text-xs text-gray-500">{session.timeframe} · {session.modelType}</span>
        </div>
        <span className={`text-xs font-semibold ${statusColor[session.status] ?? 'text-gray-400'}`}>
          {session.status}
        </span>
      </div>

      {session.status === 'FAILED' && session.errorMessage && (
        <div className="p-3 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {session.errorMessage}
        </div>
      )}

      {session.status === 'COMPLETED' && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MetricCard label="MAE" value={session.metrics.mae.toFixed(2)} />
            <MetricCard label="RMSE" value={session.metrics.rmse.toFixed(2)} />
            <MetricCard label="Dir. Accuracy" value={`${session.metrics.directionalAccuracy.toFixed(1)}%`} />
            <MetricCard label="Predictions" value={String(session.metrics.totalPredictions)} />
            <MetricCard label="MSE" value={session.metrics.mse.toFixed(2)} />
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
        </>
      )}

      <p className="text-xs text-gray-600">
        Session: <span className="font-mono">{session.id.slice(0, 8)}…</span>
        {session.completedAt && ` · Completed ${new Date(session.completedAt).toLocaleString()}`}
      </p>
    </div>
  );
}
