import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CrosshairMode, LineSeries } from 'lightweight-charts';
import type { Trade } from '../types/index.ts';
import { onPriceUpdate } from '../services/socket.ts';
import { loadPriceBuffer, savePriceBuffer } from '../services/priceCache.ts';
import {
  chartLocalization,
  chartLayoutOptions,
  chartGridOptions,
  chartRightPriceScaleOptions,
  chartTimeScaleOptions,
} from '../utils/chartConfig.ts';

interface Props {
  trades: Trade[];
  symbol?: string;
}

// Convert "BTC/USDT" → "BTCUSDT", "SOLUSDT" → "SOLUSDT"
function toWsSymbol(pair: string): string {
  return pair.replace('/', '');
}

const MAX_LIVE_POINTS = 300;
const BUCKET_SECONDS = 60; // Aggregate ticks into 1-minute buckets

export function PriceChart({ trades, symbol = 'SOL/USDT' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  const liveBufferRef = useRef<Map<number, number>>(new Map());
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledSave = useCallback((sym: string) => {
    if (saveTimerRef.current) return;
    saveTimerRef.current = setTimeout(() => {
      savePriceBuffer(toWsSymbol(sym), liveBufferRef.current);
      saveTimerRef.current = null;
    }, 5000);
  }, []);

  // Build chart once
  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current = createChart(containerRef.current, {
      layout: chartLayoutOptions,
      localization: chartLocalization,
      grid: chartGridOptions,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: chartRightPriceScaleOptions,
      timeScale: chartTimeScaleOptions,
      width: containerRef.current.clientWidth,
      height: 280,
    });

    seriesRef.current = chartRef.current.addSeries(LineSeries, {
      color: '#22d3ee',
      lineWidth: 2,
    });

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
  }, []);

  // Seed chart with cached prices + historical trade prices when symbol changes
  useEffect(() => {
    if (!seriesRef.current) return;

    // Restore from sessionStorage first
    liveBufferRef.current = loadPriceBuffer(toWsSymbol(symbol));

    const raw = trades
      .filter(t => t.pair === symbol)
      .slice(-200)
      .map(t => ({
        // Bucket to minutes so historical and live use the same scale
        time: Math.floor(new Date(t.executedAt).getTime() / 1000 / BUCKET_SECONDS) * BUCKET_SECONDS,
        value: Number(t.price),
      }));

    for (const { time, value } of raw) {
      liveBufferRef.current.set(time, value);
    }

    const sorted = Array.from(liveBufferRef.current.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as unknown as import('lightweight-charts').Time, value }));

    if (sorted.length > 0) {
      seriesRef.current.setData(sorted);
      chartRef.current?.timeScale().fitContent();
    }
  }, [trades, symbol]);

  // Stream live prices via WebSocket
  useEffect(() => {
    const wsSymbol = toWsSymbol(symbol);

    const off = onPriceUpdate((update) => {
      if (update.symbol !== wsSymbol) return;

      setLivePrice(update.price);

      if (!seriesRef.current) return;

      // Bucket to 1-minute intervals so the X axis shows meaningful time range
      const t = Math.floor(new Date(update.timestamp).getTime() / 1000 / BUCKET_SECONDS) * BUCKET_SECONDS;
      liveBufferRef.current.set(t, update.price);

      // Trim oldest entries beyond max
      if (liveBufferRef.current.size > MAX_LIVE_POINTS) {
        const oldest = Array.from(liveBufferRef.current.keys()).sort((a, b) => a - b)[0];
        liveBufferRef.current.delete(oldest);
      }

      const sorted = Array.from(liveBufferRef.current.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) => ({ time: time as unknown as import('lightweight-charts').Time, value }));

      seriesRef.current.setData(sorted);
      chartRef.current?.timeScale().scrollToRealTime();

      throttledSave(symbol);
    });

    return () => {
      off();
      // Save immediately on unmount/symbol change
      savePriceBuffer(toWsSymbol(symbol), liveBufferRef.current);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [symbol, throttledSave]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">{symbol}</span>
          {livePrice !== null && (
            <span className="text-sm font-mono text-cyan-400">
              ${livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">{trades.filter(t => t.pair === symbol).length} trades</span>
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
