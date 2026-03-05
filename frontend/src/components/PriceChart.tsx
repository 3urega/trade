import { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries } from 'lightweight-charts';
import type { Trade } from '../types/index.ts';

interface Props {
  trades: Trade[];
  symbol?: string;
}

export function PriceChart({ trades, symbol = 'SOL/USDT' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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

  useEffect(() => {
    if (!seriesRef.current) return;

    const raw = trades
      .filter(t => t.pair === symbol)
      .slice(-200)
      .map(t => ({
        time: Math.floor(new Date(t.executedAt).getTime() / 1000) as unknown as import('lightweight-charts').Time,
        value: Number(t.price),
      }))
      .sort((a, b) => Number(a.time) - Number(b.time));

    // lightweight-charts requires unique times; keep last value per second
    const byTime = new Map<number, number>();
    for (const { time, value } of raw) {
      byTime.set(Number(time), value);
    }
    const filtered = Array.from(byTime.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as unknown as import('lightweight-charts').Time, value }));

    if (filtered.length > 0) {
      seriesRef.current.setData(filtered);
      chartRef.current?.timeScale().fitContent();
    }
  }, [trades, symbol]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-300">{symbol}</span>
        <span className="text-xs text-gray-500">{trades.filter(t => t.pair === symbol).length} trades</span>
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
