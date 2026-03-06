import { useEffect, useRef, useState } from 'react';
import { createChart, createSeriesMarkers, CrosshairMode, CandlestickSeries } from 'lightweight-charts';
import type { ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time } from 'lightweight-charts';
import { fetchCandles } from '../../services/api.ts';
import type { CandleData, Timeframe } from '../../types/index.ts';
import {
  chartLocalization,
  chartLayoutOptions,
  chartGridOptions,
  chartRightPriceScaleOptions,
  getChartTimeScaleOptions,
} from '../../utils/chartConfig.ts';

interface Props {
  symbol: string;
  timeframe: Timeframe;
  start: string;
  end: string;
  onRangeSelect?: (from: string, to: string) => void;
}

const MAX_CANDLES = 1500;

type ClickPhase = 'idle' | 'from-set';

export function CandlestickChart({ symbol, timeframe, start, end, onRangeSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const fromTimeRef = useRef<number | null>(null);
  const toTimeRef = useRef<number | null>(null);
  // Keep a stable ref to the callback so the click handler always uses the latest version
  const onRangeSelectRef = useRef(onRangeSelect);
  onRangeSelectRef.current = onRangeSelect;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [clickPhase, setClickPhase] = useState<ClickPhase>('idle');

  function updateMarkers() {
    if (!markersRef.current) return;
    const markers: SeriesMarker<Time>[] = [];
    if (fromTimeRef.current !== null) {
      markers.push({
        time: fromTimeRef.current as Time,
        position: 'belowBar',
        color: '#22c55e',
        shape: 'arrowUp',
        text: 'Start',
      });
    }
    if (toTimeRef.current !== null) {
      markers.push({
        time: toTimeRef.current as Time,
        position: 'aboveBar',
        color: '#ef4444',
        shape: 'arrowDown',
        text: 'End',
      });
    }
    markersRef.current.setMarkers(markers);
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Reset selection state on dataset change
    fromTimeRef.current = null;
    toTimeRef.current = null;
    setClickPhase('idle');

    chartRef.current = createChart(container, {
      layout: chartLayoutOptions,
      localization: chartLocalization,
      grid: chartGridOptions,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: chartRightPriceScaleOptions,
      timeScale: getChartTimeScaleOptions(timeframe),
      width: container.clientWidth,
      height: 380,
    });

    const series = chartRef.current.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);

    // Click handler for range selection
    chartRef.current.subscribeClick((param) => {
      if (!param.time) return;
      const t = param.time as number;

      if (fromTimeRef.current === null || (fromTimeRef.current !== null && toTimeRef.current !== null)) {
        // First click (or reset after a complete selection)
        fromTimeRef.current = t;
        toTimeRef.current = null;
        setClickPhase('from-set');
      } else {
        // Second click: ensure from < to
        const a = fromTimeRef.current;
        if (t === a) return; // same point, ignore
        fromTimeRef.current = Math.min(a, t);
        toTimeRef.current = Math.max(a, t);

        const fromIso = new Date(fromTimeRef.current * 1000).toISOString().split('T')[0];
        const toIso = new Date(toTimeRef.current * 1000).toISOString().split('T')[0];
        onRangeSelectRef.current?.(fromIso, toIso);
        setClickPhase('idle');
      }

      updateMarkers();
    });

    const ro = new ResizeObserver(() => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    });
    ro.observe(container);

    setLoading(true);
    setError(null);
    setCount(null);

    fetchCandles(symbol, timeframe, start, end, MAX_CANDLES)
      .then((candles: CandleData[]) => {
        setCount(candles.length);
        const chartData = candles.map((c) => ({
          time: c.openTime as unknown as Time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }));
        series.setData(chartData);
        chartRef.current?.timeScale().fitContent();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load candles');
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      ro.disconnect();
      markersRef.current = null;
      seriesRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [symbol, timeframe, start, end]);

  const hintText =
    clickPhase === 'idle'
      ? 'Click on the chart to set the backtest start date'
      : 'Click again to set the end date — click twice in wrong order and they will be swapped automatically';

  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-gray-200 font-mono">{symbol}</span>
          <span className="ml-2 bg-gray-800 px-1.5 py-0.5 rounded text-xs text-gray-400">
            {timeframe}
          </span>
        </div>
        {count !== null && !loading && (
          <span className="text-xs text-gray-500">
            {count.toLocaleString('es-ES')} candles
            {count === MAX_CANDLES && (
              <span className="ml-1 text-yellow-500" title={`Showing latest ${MAX_CANDLES} only`}>
                (capped)
              </span>
            )}
          </span>
        )}
        {loading && (
          <span className="text-xs text-gray-500 animate-pulse">Loading chart…</span>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      <div ref={containerRef} className="w-full rounded overflow-hidden cursor-crosshair" />

      {/* Hint bar */}
      <div
        className={`flex items-center gap-2 text-xs px-3 py-2 rounded transition-colors ${
          clickPhase === 'from-set'
            ? 'bg-green-900/20 border border-green-700/30 text-green-400'
            : 'bg-gray-800/50 text-gray-500'
        }`}
      >
        <span
          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
            clickPhase === 'from-set' ? 'bg-green-500' : 'bg-gray-600'
          }`}
        />
        {hintText}
        {clickPhase === 'from-set' && (
          <button
            onClick={() => {
              fromTimeRef.current = null;
              toTimeRef.current = null;
              updateMarkers();
              setClickPhase('idle');
            }}
            className="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
