import { useState, useEffect, useCallback } from 'react';
import { fetchPresetsCompare } from '../services/api.ts';
import { onPresetStateChange } from '../services/socket.ts';
import type { PresetMetrics } from '../types/index.ts';

function StatCard({ label, value, sub, color }: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${color ?? 'text-gray-200'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 tabular-nums mt-0.5">{sub}</p>}
    </div>
  );
}

function BalanceBar({ currency, pct, valueUsdt }: { currency: string; pct: number; valueUsdt: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 text-gray-400 font-medium flex-shrink-0">{currency}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${currency === 'USDT' ? 'bg-gray-500' : 'bg-cyan-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="w-16 text-right text-gray-500 tabular-nums flex-shrink-0">
        ${valueUsdt.toFixed(0)}
      </span>
    </div>
  );
}

function StatusBadge({ status, isRunning }: { status: string; isRunning: boolean }) {
  const map: Record<string, string> = {
    active: 'border-green-700/40 text-green-400',
    paused: 'border-yellow-700/40 text-yellow-500',
    archived: 'border-gray-700 text-gray-600',
  };
  const labels: Record<string, string> = {
    active: 'Activo', paused: 'Pausado', archived: 'Archivado',
  };
  return (
    <div className="flex items-center gap-1.5">
      {isRunning && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      )}
      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${map[status] ?? map['archived']}`}>
        {labels[status] ?? status}
      </span>
    </div>
  );
}

function PresetMetricCard({ m, onSelect }: { m: PresetMetrics; onSelect: () => void }) {
  const pnlPos = m.pnl >= 0;
  const sign = pnlPos ? '+' : '';
  const topBalances = [...m.balances]
    .filter((b) => b.amount > 0.000001)
    .sort((a, b) => b.valueUsdt - a.valueUsdt)
    .slice(0, 4);

  return (
    <div
      onClick={onSelect}
      className="bg-gray-900 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-gray-600 hover:bg-gray-800/60 transition-all space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-100 truncate">{m.name}</h3>
          <p className="text-[10px] text-gray-600 mt-0.5 font-mono truncate">{m.walletId.slice(0, 8)}…</p>
        </div>
        <StatusBadge status={m.status} isRunning={m.isRunning} />
      </div>

      {/* Primary metrics */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Valor Total"
          value={`$${m.totalValueUsdt.toFixed(2)}`}
          sub={`Capital: $${m.initialCapital.toLocaleString()}`}
        />
        <StatCard
          label="P&L"
          value={`${sign}${m.pnl.toFixed(2)}`}
          sub={`${sign}${m.pnlPercent.toFixed(2)}%`}
          color={pnlPos ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard
          label="Trades"
          value={String(m.totalTrades)}
          sub={`${m.buyTrades}B · ${m.sellTrades}S`}
        />
        <StatCard
          label="Win Rate"
          value={m.winRate !== null ? `${(m.winRate * 100).toFixed(1)}%` : '—'}
          sub={m.maxDrawdown > 0 ? `DD: ${(m.maxDrawdown * 100).toFixed(1)}%` : undefined}
          color={
            m.winRate === null
              ? 'text-gray-500'
              : m.winRate >= 0.5
                ? 'text-green-400'
                : 'text-yellow-400'
          }
        />
      </div>

      {/* Capital breakdown */}
      {topBalances.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Desglose de capital</p>
          <div className="space-y-1.5">
            {topBalances.map((b) => (
              <BalanceBar
                key={b.currency}
                currency={b.currency}
                pct={b.pct}
                valueUsdt={b.valueUsdt}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  /** Called when the user clicks a preset card to jump to its detail view */
  onSelectPreset: (presetId: string) => void;
}

export function CompareView({ onSelectPreset }: Props) {
  const [metrics, setMetrics] = useState<PresetMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPresetsCompare();
      setMetrics(data);
      setLastRefresh(new Date());
    } catch {
      // silently keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when any preset changes state
  useEffect(() => {
    return onPresetStateChange(() => { void load(); });
  }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm animate-pulse">
        Cargando métricas…
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
        <p className="text-gray-500 text-sm">No hay presets activos para comparar.</p>
        <p className="text-gray-700 text-xs">Crea y activa al menos un preset desde la sección Trading.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-100">Comparativa de Presets</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {metrics.length} preset{metrics.length !== 1 ? 's' : ''} activo{metrics.length !== 1 ? 's' : ''}
            {lastRefresh && (
              <span className="ml-2">
                · actualizado {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* Ranking bar — best PnL% at top */}
      {metrics.length > 1 && (
        <div className="mb-6 bg-gray-800/40 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Ranking por P&L</p>
          <div className="space-y-2">
            {[...metrics]
              .sort((a, b) => b.pnlPercent - a.pnlPercent)
              .map((m, i) => {
                const pos = m.pnlPercent >= 0;
                const maxAbs = Math.max(...metrics.map((x) => Math.abs(x.pnlPercent)), 0.01);
                const barW = (Math.abs(m.pnlPercent) / maxAbs) * 100;
                return (
                  <div
                    key={m.presetId}
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => onSelectPreset(m.presetId)}
                  >
                    <span className="w-4 text-[10px] text-gray-600 text-right flex-shrink-0">
                      #{i + 1}
                    </span>
                    <span className="text-xs text-gray-300 w-32 truncate group-hover:text-white transition-colors">
                      {m.name}
                    </span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pos ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${barW}%` }}
                      />
                    </div>
                    <span className={`text-xs tabular-nums w-16 text-right flex-shrink-0 ${
                      pos ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {pos ? '+' : ''}{m.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...metrics]
          .sort((a, b) => b.pnlPercent - a.pnlPercent)
          .map((m) => (
            <PresetMetricCard
              key={m.presetId}
              m={m}
              onSelect={() => onSelectPreset(m.presetId)}
            />
          ))}
      </div>
    </div>
  );
}
